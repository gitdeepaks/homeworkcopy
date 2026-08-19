/**
 * Running external binaries.
 *
 * Source ingestion shells out to `yt-dlp`, `ffmpeg`, and `ffprobe`. Every call
 * here passes an argument vector to `spawn` and never a command string, so a
 * value that reached us from a reader — a URL, a video id — is an argument by
 * construction and can never become shell syntax.
 *
 * The other two hazards are a child that never exits and a child that writes
 * without end. Both are bounded: a timeout escalates from `SIGTERM` to
 * `SIGKILL`, and output past a byte budget kills the child rather than growing
 * the heap until the process dies.
 */

import { spawn } from "node:child_process";
import { z } from "zod";

/**
 * Retained tail of a child's stderr. Diagnostics live at the end of a failing
 * run, so the tail is what is kept when a chatty tool overruns the budget.
 */
const STDERR_TAIL_BYTES = 8_000;

/** Default cap on retained stdout. */
const DEFAULT_MAX_STDOUT_BYTES = 16 * 1024 * 1024;

/** Grace period between asking a child to stop and killing it outright. */
const KILL_GRACE_MS = 5_000;

/**
 * The binary is not installed, or not on `PATH`.
 *
 * Separate from a failed run because the remedy is different in kind: this is a
 * deployment that is missing a dependency, not a video that could not be read.
 */
export class CommandNotFoundError extends Error {
    constructor(public readonly command: string) {
        super(`${command} is not installed or not on PATH`);
        this.name = "CommandNotFoundError";
    }
}

/** The binary ran and reported failure, was killed, or overran its budget. */
export class CommandFailedError extends Error {
    constructor(
        public readonly command: string,
        /** Exit status, or `null` when the child was killed by a signal. */
        public readonly exitCode: number | null,
        /** Signal that killed the child, or `null` when it exited normally. */
        public readonly signal: NodeJS.Signals | null,
        /** Tail of the child's stderr, for logging only. */
        public readonly stderr: string,
        /** Whether the run was cut short by its own timeout. */
        public readonly timedOut: boolean,
        message: string,
    ) {
        super(message);
        this.name = "CommandFailedError";
    }
}

export type RunCommandOptions = {
    /** Binary name resolved through `PATH`, or an absolute path. */
    command: string;
    /** Argument vector. Never joined into a string, never passed to a shell. */
    args: readonly string[];
    /** Wall-clock budget for the whole run. */
    timeoutMs: number;
    /** Working directory for the child. Defaults to this process's. */
    cwd?: string;
    /** Retained stdout ceiling. Exceeding it kills the child. */
    maxStdoutBytes?: number;
};

export type CommandOutcome = {
    stdout: string;
    /** Tail of stderr, present even on success because tools warn on it. */
    stderr: string;
};

/** Node attaches `code` to spawn failures; the callback types it as `Error`. */
const spawnErrorSchema = z.object({ code: z.string().optional() });

/** Keeps the last `limit` bytes of a stream without retaining the whole of it. */
class TailBuffer {
    private chunks: Buffer[] = [];
    private size = 0;

    constructor(private readonly limit: number) {}

    push(chunk: Buffer): void {
        this.chunks.push(chunk);
        this.size += chunk.byteLength;
        while (this.size > this.limit && this.chunks.length > 1) {
            const dropped = this.chunks.shift();
            if (dropped) this.size -= dropped.byteLength;
        }
    }

    toString(): string {
        return Buffer.concat(this.chunks).subarray(-this.limit).toString("utf8");
    }
}

/**
 * Runs a binary to completion.
 *
 * @param options - Binary, argument vector, and the budgets it runs under
 * @returns Its stdout and the tail of its stderr
 * @throws {CommandNotFoundError} When the binary cannot be spawned
 * @throws {CommandFailedError} On a non-zero exit, a signal, a timeout, or
 * stdout past the budget
 */
export function runCommand(options: RunCommandOptions): Promise<CommandOutcome> {
    const {
        command,
        args,
        timeoutMs,
        cwd,
        maxStdoutBytes = DEFAULT_MAX_STDOUT_BYTES,
    } = options;

    return new Promise<CommandOutcome>((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        });

        const stdoutChunks: Buffer[] = [];
        let stdoutBytes = 0;
        const stderrTail = new TailBuffer(STDERR_TAIL_BYTES);

        let settled = false;
        let timedOut = false;
        let overranStdout = false;
        let killTimer: NodeJS.Timeout | undefined;

        const timeoutTimer = setTimeout(() => {
            timedOut = true;
            stop();
        }, timeoutMs);

        /** Asks the child to stop, then insists if it does not. */
        function stop(): void {
            child.kill("SIGTERM");
            killTimer ??= setTimeout(() => {
                child.kill("SIGKILL");
            }, KILL_GRACE_MS);
        }

        function cleanup(): void {
            clearTimeout(timeoutTimer);
            if (killTimer) clearTimeout(killTimer);
        }

        function fail(error: Error): void {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        }

        // `stdio` above pipes both streams, so these are never null in practice.
        // Refusing to run without them is still cheaper than assuming it.
        if (!child.stdout || !child.stderr) {
            stop();
            fail(new CommandNotFoundError(command));
            return;
        }

        child.stdout.on("data", (chunk: Buffer) => {
            stdoutBytes += chunk.byteLength;
            if (stdoutBytes > maxStdoutBytes) {
                overranStdout = true;
                stop();
                return;
            }
            stdoutChunks.push(chunk);
        });

        child.stderr.on("data", (chunk: Buffer) => {
            stderrTail.push(chunk);
        });

        child.on("error", (error: Error) => {
            const code = spawnErrorSchema.safeParse(error).data?.code;
            fail(
                code === "ENOENT"
                    ? new CommandNotFoundError(command)
                    : new CommandFailedError(
                          command,
                          null,
                          null,
                          stderrTail.toString(),
                          timedOut,
                          `${command} could not be started: ${error.message}`,
                      ),
            );
        });

        child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
            if (settled) return;

            if (overranStdout) {
                fail(
                    new CommandFailedError(
                        command,
                        code,
                        signal,
                        stderrTail.toString(),
                        timedOut,
                        `${command} produced more than ${maxStdoutBytes} bytes of output`,
                    ),
                );
                return;
            }

            if (timedOut) {
                fail(
                    new CommandFailedError(
                        command,
                        code,
                        signal,
                        stderrTail.toString(),
                        true,
                        `${command} timed out after ${timeoutMs}ms`,
                    ),
                );
                return;
            }

            if (code !== 0) {
                fail(
                    new CommandFailedError(
                        command,
                        code,
                        signal,
                        stderrTail.toString(),
                        false,
                        signal === null
                            ? `${command} exited with status ${String(code)}`
                            : `${command} was killed by ${signal}`,
                    ),
                );
                return;
            }

            settled = true;
            cleanup();
            resolve({
                stdout: Buffer.concat(stdoutChunks).toString("utf8"),
                stderr: stderrTail.toString(),
            });
        });
    });
}
