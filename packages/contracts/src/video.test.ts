import { describe, expect, test } from "bun:test";
import {
    buildWebVtt,
    parsePlayableVideoExplainer,
    videoExplainerCaptionCues,
    videoStoryboardSchema,
    type PlayableVideoExplainerContent,
} from "./index";

function scene(id: string, sourceLabels: string[] = ["S1"]) {
    return {
        id,
        title: `Scene ${id}`,
        bullets: ["First point"],
        narration: "Spoken narration for this scene.",
        sourceLabels,
    };
}

const media = {
    provider: "openai",
    model: "gpt-4o-mini-tts",
    voiceProfile: "warm" as const,
    voices: ["sage"],
    format: "mp3" as const,
    bytes: 2_048,
    durationMs: 9_000,
    storage: {
        provider: "cloudinary" as const,
        publicId: "chaibook/audio/out-1",
        resourceType: "video" as const,
    },
    synthesizedAt: "2026-08-17T09:00:00.000Z",
};

const playable: PlayableVideoExplainerContent = {
    version: 1,
    storyboard: {
        title: "How heat moves",
        language: "en",
        scenes: [scene("s1"), scene("s2", []), scene("s3")],
    },
    timings: [
        { segmentId: "s1", startMs: 0, endMs: 3_000 },
        { segmentId: "s2", startMs: 3_000, endMs: 6_000 },
        { segmentId: "s3", startMs: 6_000, endMs: 9_000 },
    ],
    media,
};

describe("videoStoryboardSchema", () => {
    test("requires at least one cited scene", () => {
        const parsed = videoStoryboardSchema.safeParse({
            title: "Uncited",
            language: "en",
            scenes: [scene("s1", []), scene("s2", []), scene("s3", [])],
        });
        expect(parsed.success).toBe(false);
    });

    test("rejects duplicate scene ids", () => {
        const parsed = videoStoryboardSchema.safeParse({
            title: "Duplicated",
            language: "en",
            scenes: [scene("s1"), scene("s1"), scene("s2")],
        });
        expect(parsed.success).toBe(false);
    });

    test("rejects a citation marker that is not a source label", () => {
        const parsed = videoStoryboardSchema.safeParse({
            title: "Bad marker",
            language: "en",
            scenes: [scene("s1", ["source one"]), scene("s2"), scene("s3")],
        });
        expect(parsed.success).toBe(false);
    });
});

describe("parsePlayableVideoExplainer", () => {
    test("reads content that finished synthesis", () => {
        expect(parsePlayableVideoExplainer(playable)?.media.bytes).toBe(2_048);
    });

    test("rejects content whose narration is not recorded yet", () => {
        expect(
            parsePlayableVideoExplainer({
                version: 1,
                storyboard: playable.storyboard,
            }),
        ).toBeNull();
    });

    test("returns null for an absent column", () => {
        expect(parsePlayableVideoExplainer(null)).toBeNull();
    });
});

describe("videoExplainerCaptionCues", () => {
    test("pairs narration with the audio it was spoken over", () => {
        const cues = videoExplainerCaptionCues(playable);
        expect(cues).toHaveLength(3);
        expect(cues[1]).toEqual({
            id: "s2",
            startMs: 3_000,
            endMs: 6_000,
            text: "Spoken narration for this scene.",
        });
    });

    test("skips a timing with no matching scene", () => {
        const cues = videoExplainerCaptionCues({
            ...playable,
            timings: [
                ...playable.timings,
                { segmentId: "s9", startMs: 9_000, endMs: 10_000 },
            ],
        });
        expect(cues).toHaveLength(3);
    });
});

describe("buildWebVtt", () => {
    test("renders a document a track element can consume", () => {
        const vtt = buildWebVtt([
            { id: "s1", startMs: 0, endMs: 1_500, text: "Hello there" },
        ]);

        expect(vtt.startsWith("WEBVTT\n")).toBe(true);
        expect(vtt).toContain("00:00:00.000 --> 00:00:01.500");
        expect(vtt).toContain("Hello there");
    });

    test("formats hours and rounds fractional milliseconds", () => {
        const vtt = buildWebVtt([
            { id: "s1", startMs: 3_661_234.6, endMs: 3_662_000, text: "Late" },
        ]);
        expect(vtt).toContain("01:01:01.235 --> 01:01:02.000");
    });

    test("keeps cue text on one line and neutralizes a timing arrow", () => {
        const vtt = buildWebVtt([
            {
                id: "s1",
                startMs: 0,
                endMs: 1_000,
                text: "line one\n\nline two --> still text",
            },
        ]);

        expect(vtt).toContain("line one line two → still text");
        // Header block plus one cue block: a blank line only ever separates cues.
        expect(vtt.split("\n\n")).toHaveLength(2);
    });

    test("separates consecutive cues with exactly one blank line", () => {
        const vtt = buildWebVtt([
            { id: "s1", startMs: 0, endMs: 1_000, text: "One" },
            { id: "s2", startMs: 1_000, endMs: 2_000, text: "Two" },
        ]);

        expect(vtt.split("\n\n")).toHaveLength(3);
    });
});
