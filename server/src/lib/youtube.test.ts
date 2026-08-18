import { describe, expect, test } from "bun:test";
import {
    failureFromCaptionAvailability,
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
