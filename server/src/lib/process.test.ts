import { describe, expect, test } from "bun:test";
import {
    CommandFailedError,
    CommandNotFoundError,
    runCommand,
} from "./process.js";

/**
 * `process.execPath` is whichever runtime is hosting the test, and both Node and
 * Bun accept `-e`. Using it keeps these tests from depending on a shell or on
 * any binary the machine may not have.
 */
const RUNTIME = process.execPath;

function script(source: string): string[] {
    return ["-e", source];
}

describe("runCommand", () => {
    test("returns what the child wrote to stdout", async () => {
        const { stdout } = await runCommand({
            command: RUNTIME,
            args: script("process.stdout.write('hello')"),
            timeoutMs: 10_000,
        });

        expect(stdout).toBe("hello");
    });

    test("returns stderr alongside a successful run, because tools warn on it", async () => {
        const { stdout, stderr } = await runCommand({
            command: RUNTIME,
            args: script(
                "process.stderr.write('a warning'); process.stdout.write('ok')",
            ),
            timeoutMs: 10_000,
        });

        expect(stdout).toBe("ok");
        expect(stderr).toBe("a warning");
    });

    test("a missing binary is reported as missing, not as a failed run", async () => {
        const error: unknown = await runCommand({
            command: "definitely-not-a-real-binary-9f3a",
            args: [],
            timeoutMs: 10_000,
        }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(CommandNotFoundError);
        if (!(error instanceof CommandNotFoundError)) return;
        expect(error.command).toBe("definitely-not-a-real-binary-9f3a");
    });

    test("a non-zero exit carries the status and the stderr", async () => {
        const error: unknown = await runCommand({
            command: RUNTIME,
            args: script("process.stderr.write('boom'); process.exit(3)"),
            timeoutMs: 10_000,
        }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(CommandFailedError);
        if (!(error instanceof CommandFailedError)) return;
        expect(error.exitCode).toBe(3);
        expect(error.stderr).toBe("boom");
        expect(error.timedOut).toBe(false);
    });

    test("a child that will not exit is killed and reported as timed out", async () => {
        const error: unknown = await runCommand({
            command: RUNTIME,
            args: script("setInterval(() => {}, 1000)"),
            timeoutMs: 300,
        }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(CommandFailedError);
        if (!(error instanceof CommandFailedError)) return;
        expect(error.timedOut).toBe(true);
    });

    test("output past the budget kills the child instead of growing the heap", async () => {
        const error: unknown = await runCommand({
            command: RUNTIME,
            args: script(
                "const line = 'x'.repeat(1024); for (let i = 0; i < 5000; i++) process.stdout.write(line);",
            ),
            timeoutMs: 20_000,
            maxStdoutBytes: 4_096,
        }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(CommandFailedError);
        if (!(error instanceof CommandFailedError)) return;
        expect(error.message).toContain("bytes of output");
    });

    test("arguments reach the child verbatim rather than through a shell", async () => {
        // Were this joined into a command string, the substitution would run and
        // the child would see something other than what was passed.
        const injected = "$(echo pwned); `echo pwned`; rm -rf /";

        const { stdout } = await runCommand({
            command: RUNTIME,
            args: script("process.stdout.write(process.argv[1] ?? '')").concat(
                injected,
            ),
            timeoutMs: 10_000,
        });

        expect(stdout).toBe(injected);
    });

    test("keeps only the tail of a chatty child's stderr", async () => {
        const error: unknown = await runCommand({
            command: RUNTIME,
            args: script(
                "process.stderr.write('n'.repeat(40_000) + 'THE-END'); process.exit(1)",
            ),
            timeoutMs: 20_000,
        }).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(CommandFailedError);
        if (!(error instanceof CommandFailedError)) return;
        expect(error.stderr).toEndWith("THE-END");
        expect(error.stderr.length).toBeLessThan(40_000);
    });
});
