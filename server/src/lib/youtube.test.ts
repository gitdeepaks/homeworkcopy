import { describe, expect, test } from "bun:test";
import {
    captionsUnavailableFailure,
    failureFromCaptionAvailability,
    normalizeCaptionSegments,
    parseYoutubeVideoId,
    readCaptionAvailability,
    type CaptionAvailability,
} from "./youtube.js";

const VIDEO_ID = "Cu7EG3CRuJE";

describe("readCaptionAvailability", () => {
    test("reports the languages of a video that has captions", () => {
        const availability = readCaptionAvailability({
            playabilityStatus: { status: "OK" },
            captions: {
                playerCaptionsTracklistRenderer: {
                    captionTracks: [
                        { languageCode: "en" },
                        { languageCode: "hi" },
                    ],
                },
            },
        });

        expect(availability).toEqual({
            kind: "captions-present",
            languages: ["en", "hi"],
        });
    });

    test("reports a playable video with no caption block as having none", () => {
        expect(
            readCaptionAvailability({ playabilityStatus: { status: "OK" } }),
        ).toEqual({ kind: "no-captions" });
    });

    test("reports an empty caption track list as having none", () => {
        expect(
            readCaptionAvailability({
                playabilityStatus: { status: "OK" },
                captions: {
                    playerCaptionsTracklistRenderer: { captionTracks: [] },
                },
            }),
        ).toEqual({ kind: "no-captions" });
    });

    test("treats an unplayable video as unavailable, not as caption-less", () => {
        expect(
            readCaptionAvailability({
                playabilityStatus: { status: "LOGIN_REQUIRED" },
            }),
        ).toEqual({ kind: "video-unavailable", status: "LOGIN_REQUIRED" });
    });

    test("does not let an unplayable video's stale tracks look usable", () => {
        expect(
            readCaptionAvailability({
                playabilityStatus: { status: "UNPLAYABLE" },
                captions: {
                    playerCaptionsTracklistRenderer: {
                        captionTracks: [{ languageCode: "en" }],
                    },
                },
            }).kind,
        ).toBe("video-unavailable");
    });

    test("reads a payload with no playability block as playable", () => {
        expect(readCaptionAvailability({}).kind).toBe("no-captions");
    });
});

describe("failureFromCaptionAvailability", () => {
    test("a video with no captions can never succeed, so it is not retriable", () => {
        const failure = failureFromCaptionAvailability(
            { kind: "no-captions" },
            VIDEO_ID,
        );

        expect(failure.code).toBe("NO_EXTRACTABLE_CONTENT");
        expect(failure.message).toContain("no captions");
        expect(failure.message).not.toContain("Retry");
        expect(failure.message).not.toContain("retry");
    });

    test("an unavailable video is not retriable either", () => {
        const failure = failureFromCaptionAvailability(
            { kind: "video-unavailable", status: "LOGIN_REQUIRED" },
            VIDEO_ID,
        );

        expect(failure.code).toBe("NO_EXTRACTABLE_CONTENT");
        expect(failure.message).toContain("unavailable");
    });

    test("captions that exist mean the reader was blocked, so retrying is offered", () => {
        const failure = failureFromCaptionAvailability(
            { kind: "captions-present", languages: ["en"] },
            VIDEO_ID,
        );

        expect(failure.code).toBe("EXTRACTION_FAILED");
        expect(failure.message).toContain("does have captions");
        expect(failure.message).toContain("retry");
    });

    test("an unsettled probe says so instead of asserting a cause", () => {
        const failure = failureFromCaptionAvailability(
            { kind: "unknown" },
            VIDEO_ID,
        );

        expect(failure.code).toBe("EXTRACTION_FAILED");
        expect(failure.message).toContain("may be rate-limiting");
        expect(failure.message).toContain("no captions");
    });

    test("never leaks the video id or a provider payload to the reader", () => {
        const answers: CaptionAvailability[] = [
            { kind: "no-captions" },
            { kind: "video-unavailable", status: "LOGIN_REQUIRED" },
            { kind: "captions-present", languages: ["en"] },
            { kind: "unknown" },
        ];

        for (const availability of answers) {
            const failure = failureFromCaptionAvailability(
                availability,
                VIDEO_ID,
            );
            expect(failure.message).not.toContain(VIDEO_ID);
            expect(failure.message).not.toContain("LOGIN_REQUIRED");
        }
    });

    test("every answer produces a code the source pipeline understands", () => {
        const answers: CaptionAvailability[] = [
            { kind: "no-captions" },
            { kind: "video-unavailable", status: "UNPLAYABLE" },
            { kind: "captions-present", languages: ["en"] },
            { kind: "unknown" },
        ];

        for (const availability of answers) {
            const failure = failureFromCaptionAvailability(
                availability,
                VIDEO_ID,
            );
            expect([
                "NO_EXTRACTABLE_CONTENT",
                "EXTRACTION_FAILED",
            ]).toContain(failure.code);
        }
    });
});

describe("parseYoutubeVideoId", () => {
    test("reads every URL form the importer accepts", () => {
        const urls = [
            `https://www.youtube.com/watch?v=${VIDEO_ID}`,
            `https://www.youtube.com/watch?v=${VIDEO_ID}&list=PL1234&index=2`,
            `https://youtu.be/${VIDEO_ID}`,
            `https://www.youtube.com/embed/${VIDEO_ID}`,
            `https://www.youtube.com/shorts/${VIDEO_ID}`,
            `https://www.youtube.com/live/${VIDEO_ID}`,
            `https://m.youtube.com/watch?v=${VIDEO_ID}`,
        ];

        for (const url of urls) {
            expect(parseYoutubeVideoId(url)).toBe(VIDEO_ID);
        }
    });

    test("returns null for a URL that names no video", () => {
        expect(parseYoutubeVideoId("https://www.youtube.com/@somechannel")).toBeNull();
        expect(parseYoutubeVideoId("https://example.com/watch?v=Cu7EG3CRuJE")).toBeNull();
        expect(parseYoutubeVideoId("not a url at all")).toBeNull();
    });

    test("rejects an id that is not eleven characters", () => {
        expect(parseYoutubeVideoId("https://youtu.be/tooshort")).toBeNull();
    });
});

describe("captionsUnavailableFailure", () => {
    test("a caption-less video that cannot be transcribed is not retriable", () => {
        const failure = captionsUnavailableFailure(VIDEO_ID);

        expect(failure.code).toBe("NO_EXTRACTABLE_CONTENT");
        expect(failure.message).toContain("no captions");
        expect(failure.message).not.toContain("retry");
        expect(failure.message).not.toContain(VIDEO_ID);
    });
});

describe("normalizeCaptionSegments", () => {
    test("converts a millisecond track to seconds", () => {
        // The shape the srv3 reader returns: the opening line of a 19-second
        // video, 1.2 seconds in.
        expect(
            normalizeCaptionSegments([
                { text: "All right, so here we are", offset: 1_200, duration: 2_160 },
                { text: "in front of the elephants", offset: 3_360, duration: 2_000 },
            ]),
        ).toEqual([
            { text: "All right, so here we are", offset: 1.2, duration: 2.16 },
            { text: "in front of the elephants", offset: 3.36, duration: 2 },
        ]);
    });

    test("leaves a track that already reports seconds alone", () => {
        expect(
            normalizeCaptionSegments([
                { text: "one", offset: 1.2, duration: 2.16 },
                { text: "two", offset: 3.36, duration: 2 },
            ]),
        ).toEqual([
            { text: "one", offset: 1.2, duration: 2.16 },
            { text: "two", offset: 3.36, duration: 2 },
        ]);
    });

    test("a single malformed cue cannot decide the unit for the track", () => {
        const normalized = normalizeCaptionSegments([
            { text: "one", offset: 0, duration: 2 },
            { text: "two", offset: 2, duration: 3 },
            { text: "three", offset: 5, duration: 9_999 },
            { text: "four", offset: 8, duration: 2 },
        ]);

        expect(normalized[0]?.offset).toBe(0);
        expect(normalized[3]?.offset).toBe(8);
    });

    test("a track of zero-length cues is taken as seconds", () => {
        expect(
            normalizeCaptionSegments([{ text: "one", offset: 5, duration: 0 }]),
        ).toEqual([{ text: "one", offset: 5, duration: 0 }]);
    });

    test("keeps a short video's millisecond timings from being read as seconds", () => {
        // Every offset here is small enough to look plausible in seconds; only
        // the cue durations reveal the unit.
        const normalized = normalizeCaptionSegments([
            { text: "hi", offset: 500, duration: 1_500 },
            { text: "there", offset: 2_000, duration: 1_500 },
        ]);

        expect(normalized[0]?.offset).toBe(0.5);
        expect(normalized[1]?.offset).toBe(2);
    });

    test("never produces a negative or non-finite timing", () => {
        for (const segment of normalizeCaptionSegments([
            { text: "one", offset: 0, duration: 3_000 },
            { text: "two", offset: 3_000, duration: 3_000 },
        ])) {
            expect(Number.isFinite(segment.offset)).toBe(true);
            expect(segment.offset).toBeGreaterThanOrEqual(0);
            expect(segment.duration).toBeGreaterThanOrEqual(0);
        }
    });

    test("an empty track normalizes to nothing", () => {
        expect(normalizeCaptionSegments([])).toEqual([]);
    });
});
