import { afterEach, describe, expect, test } from "bun:test";
import { SOURCE_AUDIO_UPLOAD_MAX_BYTES } from "@homeworkcopy/contracts";
import {
    buildDownloadArgs,
    classifyDownloadFailure,
    isYoutubeAudioFallbackEnabled,
    maxTranscribableDurationSeconds,
    resolveWindowSeconds,
    toWindowStarts,
} from "./youtube-audio.js";

/** Restores whatever the ambient environment had after each case. */
const OVERRIDABLE = [
    "YOUTUBE_AUDIO_FALLBACK",
    "YOUTUBE_AUDIO_MAX_DURATION_MINUTES",
    "YTDLP_COOKIES_FILE",
    "YTDLP_PROXY",
    "YTDLP_EXTRACTOR_ARGS",
    "FFMPEG_PATH",
] as const;

const originalEnvironment = new Map(
    OVERRIDABLE.map((name) => [name, process.env[name]]),
);

afterEach(() => {
    for (const [name, value] of originalEnvironment) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
});

describe("resolveWindowSeconds", () => {
    test("keeps a window inside the provider's byte ceiling", () => {
        // 32 kbps is 4,000 bytes per second, so a 100 KB ceiling holds 25
        // seconds before the safety margin and 20 after it.
        expect(resolveWindowSeconds(100_000)).toBe(20);
    });

    test("caps a generous ceiling at the request-length limit", () => {
        // Whisper's 25 MB would hold well over an hour, which is a single
        // request long enough to risk the provider's own timeout.
        expect(resolveWindowSeconds(SOURCE_AUDIO_UPLOAD_MAX_BYTES)).toBe(20 * 60);
    });

    test("never produces a zero-length window", () => {
        expect(resolveWindowSeconds(1)).toBe(1);
        expect(resolveWindowSeconds(0)).toBe(1);
    });

    test("a window always fits the ceiling it was derived from", () => {
        const bytesPerSecond = (32 * 1_000) / 8;
        for (const ceiling of [50_000, 250_000, 4_000_000, 26_214_400]) {
            expect(resolveWindowSeconds(ceiling) * bytesPerSecond).toBeLessThanOrEqual(
                ceiling,
            );
        }
    });
});

describe("toWindowStarts", () => {
    test("offsets each window by the real duration of everything before it", () => {
        expect(toWindowStarts([1_200, 1_200, 640])).toEqual([0, 1_200, 2_400]);
    });

    test("accumulates measured durations rather than assuming equal windows", () => {
        // ffmpeg cuts on a frame boundary, so parts are never exactly the
        // requested length. Assuming they were would drift the later timestamps.
        expect(toWindowStarts([1_200.024, 1_199.976, 300])).toEqual([
            0, 1_200.024, 2_400,
        ]);
    });

    test("a single window starts at the beginning", () => {
        expect(toWindowStarts([742.5])).toEqual([0]);
    });

    test("no windows yield no starts", () => {
        expect(toWindowStarts([])).toEqual([]);
    });
});

describe("classifyDownloadFailure", () => {
    test("a removed video can never succeed, so it is not retriable", () => {
        const failure = classifyDownloadFailure(
            "ERROR: [youtube] dQw4w9WgXcQ: Video unavailable",
        );

        expect(failure.code).toBe("NO_EXTRACTABLE_CONTENT");
        expect(failure.message).not.toContain("Retry");
    });

    test("a private video is not retriable either", () => {
        expect(
            classifyDownloadFailure("ERROR: Private video. Sign in if you've been granted access").code,
        ).toBe("NO_EXTRACTABLE_CONTENT");
    });

    test("a members-only video is reported as needing sign-in", () => {
        const failure = classifyDownloadFailure(
            "ERROR: Join this channel to get access to members-only content",
        );

        expect(failure.code).toBe("NO_EXTRACTABLE_CONTENT");
        expect(failure.message).toContain("signing in");
    });

    test("YouTube's bot check is a block that clears, so a retry is offered", () => {
        const failure = classifyDownloadFailure(
            "ERROR: Sign in to confirm you're not a bot. Use --cookies-from-browser",
        );

        expect(failure.code).toBe("EXTRACTION_FAILED");
        expect(failure.message).toContain("Retry");
    });

    test("rate limiting is treated the same way", () => {
        expect(classifyDownloadFailure("HTTP Error 429: Too Many Requests").code).toBe(
            "EXTRACTION_FAILED",
        );
    });

    test("an unrecognised failure is assumed transient rather than permanent", () => {
        const failure = classifyDownloadFailure("ERROR: unable to download video data");

        expect(failure.code).toBe("EXTRACTION_FAILED");
        expect(failure.message).toContain("Retry");
    });

    test("never surfaces the tool's own output to the reader", () => {
        const stderr =
            "ERROR: unable to download https://rr3---sn-a5msen7z.googlevideo.com/videoplayback?expire=1&sig=SECRET";

        expect(classifyDownloadFailure(stderr).message).not.toContain("googlevideo");
        expect(classifyDownloadFailure(stderr).message).not.toContain("SECRET");
    });

    test("matches regardless of how the tool cased its message", () => {
        expect(classifyDownloadFailure("VIDEO UNAVAILABLE").code).toBe(
            "NO_EXTRACTABLE_CONTENT",
        );
    });
});

describe("isYoutubeAudioFallbackEnabled", () => {
    test("is on by default, because the alternative is a failed import", () => {
        delete process.env.YOUTUBE_AUDIO_FALLBACK;
        expect(isYoutubeAudioFallbackEnabled()).toBe(true);
    });

    test("can be switched off to protect the transcription budget", () => {
        for (const value of ["0", "false", "off", "OFF"]) {
            process.env.YOUTUBE_AUDIO_FALLBACK = value;
            expect(isYoutubeAudioFallbackEnabled()).toBe(false);
        }
    });

    test("stays on for anything that is not a recognised refusal", () => {
        process.env.YOUTUBE_AUDIO_FALLBACK = "1";
        expect(isYoutubeAudioFallbackEnabled()).toBe(true);
    });
});

describe("maxTranscribableDurationSeconds", () => {
    test("defaults to two hours", () => {
        delete process.env.YOUTUBE_AUDIO_MAX_DURATION_MINUTES;
        expect(maxTranscribableDurationSeconds()).toBe(120 * 60);
    });

    test("honours a configured limit", () => {
        process.env.YOUTUBE_AUDIO_MAX_DURATION_MINUTES = "45";
        expect(maxTranscribableDurationSeconds()).toBe(45 * 60);
    });

    test("an unusable setting falls back rather than removing the limit", () => {
        for (const value of ["", "soon", "0", "-30"]) {
            process.env.YOUTUBE_AUDIO_MAX_DURATION_MINUTES = value;
            expect(maxTranscribableDurationSeconds()).toBe(120 * 60);
        }
    });
});

describe("buildDownloadArgs", () => {
    const URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";

    function argsFor(url = URL): string[] {
        return buildDownloadArgs(url, "/tmp/work/audio.%(ext)s");
    }

    test("never lets a playlist turn one import into hundreds", () => {
        expect(argsFor(`${URL}&list=PLabc123`)).toContain("--no-playlist");
    });

    test("puts the URL last, behind an end-of-options marker", () => {
        const args = argsFor();

        expect(args[args.length - 1]).toBe(URL);
        expect(args[args.length - 2]).toBe("--");
    });

    test("a URL that looks like a flag is still passed as a URL", () => {
        // The `--` above is what makes this safe; without it yt-dlp would read
        // this as an unknown option and fail, or worse, as a real one.
        const hostile = "--config-location=/etc/passwd";
        const args = argsFor(hostile);

        expect(args[args.length - 1]).toBe(hostile);
        expect(args.indexOf("--")).toBe(args.length - 2);
    });

    test("prefers audio-only and degrades to a small progressive stream", () => {
        const args = argsFor();
        const format = args[args.indexOf("--format") + 1];

        expect(format).toBe("bestaudio/best[height<=480]/best");
    });

    test("encodes to mono 16 kHz, which is what recognition uses anyway", () => {
        const args = argsFor();
        const postprocessor = args[args.indexOf("--postprocessor-args") + 1];

        expect(postprocessor).toBe("ExtractAudio:-ac 1 -ar 16000");
        expect(args[args.indexOf("--audio-format") + 1]).toBe("mp3");
        expect(args[args.indexOf("--audio-quality") + 1]).toBe("32K");
    });

    test("bounds the download so a progressive fallback cannot fill the disk", () => {
        process.env.YOUTUBE_AUDIO_MAX_DURATION_MINUTES = "120";
        const args = argsFor();

        expect(args[args.indexOf("--max-filesize") + 1]).toBe(
            String(120 * 60 * 100_000),
        );
    });

    test("omits the optional escape hatches when they are not configured", () => {
        for (const name of [
            "YTDLP_COOKIES_FILE",
            "YTDLP_PROXY",
            "YTDLP_EXTRACTOR_ARGS",
            "FFMPEG_PATH",
        ]) {
            delete process.env[name];
        }
        const args = argsFor();

        expect(args).not.toContain("--cookies");
        expect(args).not.toContain("--proxy");
        expect(args).not.toContain("--extractor-args");
        expect(args).not.toContain("--ffmpeg-location");
    });

    test("passes the escape hatches through when they are configured", () => {
        process.env.YTDLP_COOKIES_FILE = "/secrets/cookies.txt";
        process.env.YTDLP_PROXY = "socks5://127.0.0.1:9050";
        process.env.YTDLP_EXTRACTOR_ARGS = "youtube:player_client=tv";
        process.env.FFMPEG_PATH = "/opt/bin/ffmpeg";
        const args = argsFor();

        expect(args[args.indexOf("--cookies") + 1]).toBe("/secrets/cookies.txt");
        expect(args[args.indexOf("--proxy") + 1]).toBe("socks5://127.0.0.1:9050");
        expect(args[args.indexOf("--extractor-args") + 1]).toBe(
            "youtube:player_client=tv",
        );
        expect(args[args.indexOf("--ffmpeg-location") + 1]).toBe("/opt/bin/ffmpeg");
    });
});
