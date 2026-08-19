/**
 * Audio extraction for YouTube videos that have no captions.
 *
 * The caption path in `./youtube.js` is free and exact, so it is always tried
 * first. This is the fallback: `yt-dlp` fetches the audio stream, `ffmpeg`
 * re-encodes it to something a speech-to-text vendor accepts, and the result is
 * handed back as one or more windows for transcription.
 *
 * Two constraints shape the encoding. Vendors cap the bytes they accept in one
 * request — 25 MB for Whisper — and speech recognition resamples to 16 kHz mono
 * regardless of what it is given. So the audio is encoded straight to 16 kHz
 * mono at a low bitrate: nothing is lost that recognition would have used, and a
 * two-hour video lands well inside the cap.
 *
 * Anything longer than one window is split by `ffmpeg` and each part's true
 * duration read back with `ffprobe`, because a citation points at a moment in
 * the video and an accumulated rounding error would move it.
 */

import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import {
    CommandFailedError,
    CommandNotFoundError,
    runCommand,
} from "./process.js";
import { logger } from "./logger.js";
import { parseYoutubeVideoId } from "./youtube.js";
import { SourceExtractionError, ValidationError } from "../types/app-error.js";

/**
 * Encoding the audio is delivered in.
 *
 * MP3 rather than a better modern codec because every speech-to-text vendor
 * accepts it, and this module sits behind a provider interface that is meant to
 * be swappable without touching the ingestion path.
 */
const AUDIO_FORMAT = "mp3";
const AUDIO_MIME_TYPE = "audio/mpeg";
const AUDIO_BITRATE_KBPS = 32;
const AUDIO_SAMPLE_RATE_HZ = 16_000;
const AUDIO_BYTES_PER_SECOND = (AUDIO_BITRATE_KBPS * 1_000) / 8;

/**
 * Longest single transcription request, independent of the byte budget.
 *
 * A window is cut on a frame boundary rather than a pause, so each cut costs
 * about one garbled word. Twenty minutes keeps those cuts rare while staying
 * far inside a vendor's own request timeout.
 */
const MAX_WINDOW_SECONDS = 20 * 60;

/** Headroom against the vendor's byte cap, for container and tag overhead. */
const WINDOW_BYTE_SAFETY = 0.8;

const DEFAULT_MAX_DURATION_MINUTES = 120;

/**
 * Bandwidth ceiling for the fallback's own download, per second of video.
 *
 * The format selector prefers an audio-only stream, but YouTube increasingly
 * serves those only against a PO token, and the graceful degradation is a
 * progressive stream that carries video too. This bounds what that degradation
 * can cost: 100 KB/s comfortably covers a 360p progressive stream and stops a
 * pathological format from filling the disk.
 */
const MAX_DOWNLOAD_BYTES_PER_SECOND = 100_000;

const METADATA_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 15 * 60_000;
const SEGMENT_TIMEOUT_MS = 5 * 60_000;
const PROBE_TIMEOUT_MS = 60_000;

/** Prefix of every file this module produces, inside its own temp directory. */
const AUDIO_BASENAME = "audio";
const WINDOW_BASENAME = "window";

function envValue(name: string): string | undefined {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
}

function ytdlpBinary(): string {
    return envValue("YTDLP_PATH") ?? "yt-dlp";
}

function ffmpegBinary(): string {
    return envValue("FFMPEG_PATH") ?? "ffmpeg";
}

function ffprobeBinary(): string {
    return envValue("FFPROBE_PATH") ?? "ffprobe";
}

/**
 * Whether a caption-less video may be transcribed from its audio.
 *
 * Enabled unless switched off, because the alternative is an import that simply
 * fails. Operators who would rather not spend transcription budget on video
 * imports set `YOUTUBE_AUDIO_FALLBACK=0`.
 */
export function isYoutubeAudioFallbackEnabled(): boolean {
    const configured = envValue("YOUTUBE_AUDIO_FALLBACK")?.toLowerCase();
    return configured !== "0" && configured !== "false" && configured !== "off";
}

/**
 * Longest video the fallback will transcribe, in seconds.
 *
 * A cap exists because transcription is billed by the minute and a live archive
 * can run for eight hours. An unreadable or non-positive setting falls back to
 * the default rather than disabling the limit.
 */
export function maxTranscribableDurationSeconds(): number {
    const configured = Number(envValue("YOUTUBE_AUDIO_MAX_DURATION_MINUTES"));
    const minutes =
        Number.isFinite(configured) && configured > 0
            ? configured
            : DEFAULT_MAX_DURATION_MINUTES;
    return Math.round(minutes * 60);
}

/**
 * Largest download the fallback will accept, in bytes.
 *
 * Derived from the duration cap rather than fixed, so raising how long a video
 * may be does not silently leave the byte ceiling behind and start failing
 * imports that the duration cap was meant to allow.
 *
 * @returns The `--max-filesize` value to pass yt-dlp
 */
export function maxDownloadBytes(): number {
    return maxTranscribableDurationSeconds() * MAX_DOWNLOAD_BYTES_PER_SECOND;
}

/**
 * The fields the fallback reads from a `yt-dlp` metadata dump. The payload
 * carries hundreds more; ignoring them by construction keeps a vendor's schema
 * change from breaking an import that never looked at the changed field.
 */
const videoMetadataSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1).nullish(),
    /** Seconds. Absent for a live stream, and for some age-gated videos. */
    duration: z.number().finite().positive().nullish(),
    is_live: z.boolean().nullish(),
    live_status: z.string().nullish(),
});

const ffprobeOutputSchema = z.object({
    format: z
        .object({
            /** ffprobe reports seconds as a decimal string, e.g. `"1200.024"`. */
            duration: z.string().min(1).optional(),
        })
        .optional(),
});

/** What YouTube reports about a video, reduced to what the fallback acts on. */
export type YoutubeAudioFacts = {
    videoId: string;
    title: string | null;
    /** Seconds, or `null` when YouTube reported none. */
    durationSeconds: number | null;
};

/** One transcribable slice of a video's audio, in playback order. */
export type YoutubeAudioWindow = {
    /** Absolute path inside the run's temp directory. Deleted on return. */
    filePath: string;
    fileName: string;
    mimeType: string;
    /** Seconds from the start of the video at which this window begins. */
    startSeconds: number;
    byteLength: number;
};

export type YoutubeAudioOptions = {
    /** Largest file the transcription provider accepts in one request. */
    maxWindowBytes: number;
};

/**
 * Window length that keeps each part inside the vendor's byte cap.
 *
 * Derived from the encoding rather than hardcoded, so raising the bitrate can
 * never silently start producing windows the vendor will reject.
 *
 * @param maxWindowBytes - The vendor's per-request ceiling
 * @returns Whole seconds of audio per window, at least one
 */
export function resolveWindowSeconds(maxWindowBytes: number): number {
    const byBytes = Math.floor(
        (maxWindowBytes * WINDOW_BYTE_SAFETY) / AUDIO_BYTES_PER_SECOND,
    );
    return Math.max(1, Math.min(MAX_WINDOW_SECONDS, byBytes));
}

/**
 * Turns per-window durations into the offset each window starts at.
 *
 * Every window's offset is the sum of the real durations before it, so a
 * transcript's timestamps stay aligned with the video across any number of cuts.
 *
 * @param durationsSeconds - Measured duration of each window, in playback order
 * @returns Start offset of each window, in seconds
 */
export function toWindowStarts(
    durationsSeconds: readonly number[],
): number[] {
    const starts: number[] = [];
    let elapsed = 0;
    for (const duration of durationsSeconds) {
        starts.push(elapsed);
        elapsed += duration;
    }
    return starts;
}

/**
 * Explains a `yt-dlp` failure in terms the reader can act on.
 *
 * The distinction that matters is the same one the caption path draws:
 * `NO_EXTRACTABLE_CONTENT` means a retry can never help, `EXTRACTION_FAILED`
 * means the attempt was blocked and a later one may work. YouTube's bot check
 * and its rate limiting are the common blocked cases on a server, and both clear
 * on their own.
 *
 * @param stderr - Tail of the tool's stderr, never shown to a reader
 * @returns The failure to raise
 */
export function classifyDownloadFailure(stderr: string): SourceExtractionError {
    const text = stderr.toLowerCase();

    if (
        text.includes("private video") ||
        text.includes("video unavailable") ||
        text.includes("removed by the uploader") ||
        text.includes("account associated with this video has been terminated")
    ) {
        return new SourceExtractionError(
            "NO_EXTRACTABLE_CONTENT",
            "This video is unavailable, so its audio cannot be transcribed.",
        );
    }

    if (
        text.includes("members-only") ||
        text.includes("age-restricted") ||
        text.includes("sign in to confirm your age") ||
        text.includes("join this channel")
    ) {
        return new SourceExtractionError(
            "NO_EXTRACTABLE_CONTENT",
            "This video requires signing in to watch, so its audio cannot be transcribed.",
        );
    }

    if (
        text.includes("sign in to confirm you're not a bot") ||
        text.includes("http error 429") ||
        text.includes("too many requests")
    ) {
        return new SourceExtractionError(
            "EXTRACTION_FAILED",
            "YouTube is currently blocking downloads from this server. Retry the import in a few minutes.",
        );
    }

    return new SourceExtractionError(
        "EXTRACTION_FAILED",
        "Could not read this video's audio. Retry the import.",
    );
}

/**
 * Wraps whatever the tools threw as a failure the pipeline can classify.
 *
 * A missing binary is a deployment problem rather than a problem with the video,
 * so it is logged in full and reported as the plain fact that the server cannot
 * transcribe. Everything else is read from stderr, which is never surfaced: it
 * carries request URLs and occasionally cookies.
 */
function toAudioFailure(error: unknown, videoId: string): SourceExtractionError {
    if (error instanceof CommandNotFoundError) {
        logger.error(
            { videoId, command: error.command },
            "youtube audio fallback is missing a required binary",
        );
        return new SourceExtractionError(
            "EXTRACTION_FAILED",
            "This video has no captions, and audio transcription is unavailable on this server.",
        );
    }

    if (error instanceof CommandFailedError) {
        logger.warn(
            {
                videoId,
                command: error.command,
                exitCode: error.exitCode,
                signal: error.signal,
                timedOut: error.timedOut,
                stderr: error.stderr,
            },
            "youtube audio extraction failed",
        );
        return error.timedOut
            ? new SourceExtractionError(
                  "EXTRACTION_FAILED",
                  "Reading this video's audio took too long. Retry the import.",
              )
            : classifyDownloadFailure(error.stderr);
    }

    if (error instanceof SourceExtractionError) return error;

    logger.error({ error, videoId }, "youtube audio extraction failed");
    return new SourceExtractionError(
        "EXTRACTION_FAILED",
        "Could not read this video's audio. Retry the import.",
    );
}

/** Argument vector for the metadata probe. */
function buildMetadataArgs(url: string): string[] {
    return [
        ...buildCommonArgs(),
        "--skip-download",
        "--dump-single-json",
        "--",
        url,
    ];
}

/** Argument vector for the download and re-encode. */
export function buildDownloadArgs(url: string, outputTemplate: string): string[] {
    const args = [
        ...buildCommonArgs(),
        // Safe here because the download reads nothing from stdout, unlike the
        // metadata probe whose whole output arrives on it.
        "--quiet",
        // Audio-only first. YouTube serves those only against a PO token for an
        // increasing share of videos, so the fallbacks are a small progressive
        // stream and then anything at all — ffmpeg discards the video track
        // either way, and a larger download beats a failed import.
        "--format",
        "bestaudio/best[height<=480]/best",
        "--max-filesize",
        String(maxDownloadBytes()),
        "--extract-audio",
        "--audio-format",
        AUDIO_FORMAT,
        // yt-dlp reads a bitrate suffixed with `K` as a constant rate, which is
        // what makes the window arithmetic above predictable.
        "--audio-quality",
        `${AUDIO_BITRATE_KBPS}K`,
        // Scoped to the extractor so it cannot leak into another postprocessor.
        "--postprocessor-args",
        `ExtractAudio:-ac 1 -ar ${AUDIO_SAMPLE_RATE_HZ}`,
        "--output",
        outputTemplate,
    ];

    const ffmpegLocation = envValue("FFMPEG_PATH");
    if (ffmpegLocation) args.push("--ffmpeg-location", ffmpegLocation);

    args.push("--", url);
    return args;
}

/**
 * Flags every `yt-dlp` invocation carries.
 *
 * `--no-playlist` is the load-bearing one: a watch URL that also names a
 * playlist would otherwise download every video in it.
 */
function buildCommonArgs(): string[] {
    const args = [
        "--no-playlist",
        "--no-progress",
        "--no-warnings",
        "--no-color",
        "--retries",
        "3",
        "--fragment-retries",
        "3",
        "--socket-timeout",
        "30",
    ];

    // The two standard escape hatches when YouTube refuses a datacentre IP.
    const cookies = envValue("YTDLP_COOKIES_FILE");
    if (cookies) args.push("--cookies", cookies);

    const proxy = envValue("YTDLP_PROXY");
    if (proxy) args.push("--proxy", proxy);

    // Which player client yt-dlp impersonates decides which formats YouTube
    // will actually serve, and YouTube changes that every few months. Passed
    // through verbatim so an operator can follow yt-dlp's current advice
    // without waiting on a release here.
    const extractorArgs = envValue("YTDLP_EXTRACTOR_ARGS");
    if (extractorArgs) args.push("--extractor-args", extractorArgs);

    return args;
}

/**
 * Asks YouTube what a video is before spending bandwidth on it.
 *
 * @param url - YouTube page URL
 * @returns The facts the fallback acts on
 * @throws {SourceExtractionError} When the video cannot or should not be read
 */
async function readVideoMetadata(
    url: string,
    videoId: string,
): Promise<YoutubeAudioFacts> {
    const { stdout } = await runCommand({
        command: ytdlpBinary(),
        args: buildMetadataArgs(url),
        timeoutMs: METADATA_TIMEOUT_MS,
    });

    const parsed = videoMetadataSchema.safeParse(JSON.parse(stdout));
    if (!parsed.success) {
        logger.warn({ videoId }, "yt-dlp metadata payload unreadable");
        throw new SourceExtractionError(
            "EXTRACTION_FAILED",
            "Could not read this video's details. Retry the import.",
        );
    }

    const { title, duration, is_live: isLive, live_status: liveStatus } = parsed.data;

    // A stream that has not finished has no fixed length to transcribe, and its
    // audio would be downloaded until the request times out.
    if (isLive === true || liveStatus === "is_live" || liveStatus === "is_upcoming") {
        throw new SourceExtractionError(
            "NO_EXTRACTABLE_CONTENT",
            "This is a live stream, so there is no finished recording to transcribe. Try again once it has ended.",
        );
    }

    const limitSeconds = maxTranscribableDurationSeconds();
    if (duration != null && duration > limitSeconds) {
        throw new SourceExtractionError(
            "NO_EXTRACTABLE_CONTENT",
            `This video has no captions, and it is longer than the ${Math.round(limitSeconds / 60)}-minute limit for transcribing audio.`,
        );
    }

    return {
        videoId,
        title: title ?? null,
        durationSeconds: duration ?? null,
    };
}

/** Finds the single audio file `yt-dlp` wrote into a fresh directory. */
async function findProducedAudio(workDir: string): Promise<string> {
    const entries = await readdir(workDir);
    const produced = entries.find((entry) =>
        entry.startsWith(`${AUDIO_BASENAME}.`),
    );
    if (!produced) {
        throw new SourceExtractionError(
            "EXTRACTION_FAILED",
            "Could not read this video's audio. Retry the import.",
        );
    }
    return path.join(workDir, produced);
}

/** Reads a file's exact playback duration in seconds. */
async function probeDurationSeconds(filePath: string): Promise<number> {
    const { stdout } = await runCommand({
        command: ffprobeBinary(),
        args: [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            "-i",
            filePath,
        ],
        timeoutMs: PROBE_TIMEOUT_MS,
    });

    const parsed = ffprobeOutputSchema.safeParse(JSON.parse(stdout));
    const duration = Number(parsed.data?.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
        throw new SourceExtractionError(
            "EXTRACTION_FAILED",
            "Could not measure this video's audio. Retry the import.",
        );
    }
    return duration;
}

/**
 * Splits one audio file into windows the vendor will accept.
 *
 * Stream-copied rather than re-encoded, so the split costs a second rather than
 * a second pass over the whole recording and cannot degrade the audio.
 */
async function splitIntoWindows(
    workDir: string,
    filePath: string,
    windowSeconds: number,
): Promise<string[]> {
    await runCommand({
        command: ffmpegBinary(),
        args: [
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-y",
            "-i",
            filePath,
            "-vn",
            "-c",
            "copy",
            "-f",
            "segment",
            "-segment_time",
            String(windowSeconds),
            "-reset_timestamps",
            "1",
            path.join(workDir, `${WINDOW_BASENAME}-%04d.${AUDIO_FORMAT}`),
        ],
        timeoutMs: SEGMENT_TIMEOUT_MS,
    });

    const entries = await readdir(workDir);
    return entries
        .filter((entry) => entry.startsWith(`${WINDOW_BASENAME}-`))
        // ffmpeg pads the index, so lexical order is playback order.
        .sort()
        .map((entry) => path.join(workDir, entry));
}

/** Measures each window and pins it to its offset in the video. */
async function describeWindows(
    filePaths: readonly string[],
    maxWindowBytes: number,
): Promise<YoutubeAudioWindow[]> {
    const sizes: number[] = [];
    const durations: number[] = [];

    for (const filePath of filePaths) {
        const stats = await stat(filePath);
        if (stats.size > maxWindowBytes) {
            throw new SourceExtractionError(
                "EXTRACTION_FAILED",
                "This video's audio could not be prepared for transcription. Retry the import.",
            );
        }
        sizes.push(stats.size);
        durations.push(await probeDurationSeconds(filePath));
    }

    const starts = toWindowStarts(durations);

    return filePaths.map((filePath, index) => ({
        filePath,
        fileName: path.basename(filePath),
        mimeType: AUDIO_MIME_TYPE,
        startSeconds: starts[index] ?? 0,
        byteLength: sizes[index] ?? 0,
    }));
}

/**
 * Downloads a video's audio and hands it to `use` as transcribable windows.
 *
 * Scoped rather than returned: the audio lives in a temp directory that is
 * removed as soon as `use` settles, so no caller can leak a video's audio onto
 * the disk by forgetting to clean up. The paths in the windows are invalid once
 * this resolves.
 *
 * @param url - YouTube page URL
 * @param options - The transcription provider's per-request byte ceiling
 * @param use - Receives the windows in playback order, and the video's facts
 * @returns Whatever `use` returned
 * @throws {ValidationError} When the URL is not a YouTube video URL
 * @throws {SourceExtractionError} When the audio cannot be read, carrying
 * whether a retry could ever succeed
 */
export async function withYoutubeAudio<T>(
    url: string,
    options: YoutubeAudioOptions,
    use: (
        windows: readonly YoutubeAudioWindow[],
        facts: YoutubeAudioFacts,
    ) => Promise<T>,
): Promise<T> {
    const videoId = parseYoutubeVideoId(url);
    if (!videoId) {
        throw new ValidationError("Enter a valid YouTube URL");
    }

    const facts = await readVideoMetadata(url, videoId).catch((error: unknown) => {
        throw toAudioFailure(error, videoId);
    });

    const workDir = await mkdtemp(path.join(tmpdir(), "youtube-audio-"));
    try {
        const windows = await prepareWindows(
            url,
            videoId,
            workDir,
            options.maxWindowBytes,
        );
        logger.info(
            {
                videoId,
                windowCount: windows.length,
                durationSeconds: facts.durationSeconds,
            },
            "youtube audio prepared for transcription",
        );
        return await use(windows, facts);
    } finally {
        await rm(workDir, { recursive: true, force: true });
    }
}

/** Download, split, and measure, with every tool failure classified alike. */
async function prepareWindows(
    url: string,
    videoId: string,
    workDir: string,
    maxWindowBytes: number,
): Promise<YoutubeAudioWindow[]> {
    try {
        await runCommand({
            command: ytdlpBinary(),
            args: buildDownloadArgs(
                url,
                path.join(workDir, `${AUDIO_BASENAME}.%(ext)s`),
            ),
            timeoutMs: DOWNLOAD_TIMEOUT_MS,
        });

        const audioPath = await findProducedAudio(workDir);
        const { size } = await stat(audioPath);

        // One request is both cheaper and exact, so splitting is reserved for
        // recordings that genuinely will not fit in one.
        const filePaths =
            size <= maxWindowBytes
                ? [audioPath]
                : await splitIntoWindows(
                      workDir,
                      audioPath,
                      resolveWindowSeconds(maxWindowBytes),
                  );

        const windows = await describeWindows(filePaths, maxWindowBytes);
        if (windows.length === 0) {
            throw new SourceExtractionError(
                "NO_EXTRACTABLE_CONTENT",
                "This video has no audio to transcribe.",
            );
        }
        return windows;
    } catch (error: unknown) {
        throw toAudioFailure(error, videoId);
    }
}

/**
 * Reads one window's bytes for a transcription request.
 *
 * Copied into a standalone `ArrayBuffer` rather than handed the pooled buffer
 * `readFile` returns, whose backing store is shared with unrelated reads.
 *
 * @param window - Window to read
 * @returns Its complete bytes
 */
export async function readWindowBytes(
    window: YoutubeAudioWindow,
): Promise<ArrayBuffer> {
    const bytes = await readFile(window.filePath);
    const audio = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(audio).set(bytes);
    return audio;
}
