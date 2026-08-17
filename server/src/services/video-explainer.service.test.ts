import { describe, expect, test } from "bun:test";
import type {
    OutputGenerationOptions,
    OutputSourceLabel,
} from "@homeworkcopy/contracts";
import { OutputGenerationError } from "../types/app-error.js";
import {
    buildStoryboardSystemPrompt,
    buildVideoSummary,
    normalizeStoryboard,
    reusableStoryboard,
    storedVideoPublicId,
    storyboardFingerprint,
    storyboardResponseSchemaFor,
} from "./video-explainer.service.js";

const options: OutputGenerationOptions = {
    version: 1,
    length: "standard",
    locale: "en",
    audio: { style: "narration", voice: "warm" },
};

const sourceLabels: OutputSourceLabel[] = [
    { label: "S1", sourceId: "src-1", title: "Field guide" },
];

const sources = [{ sourceId: "src-1", processingVersion: 1 }];

function rawScene(title: string, sourceLabels: string[] = ["S1"]) {
    return {
        title,
        bullets: ["On-screen point"],
        narration: "  Spoken narration for this scene.  ",
        sourceLabels,
    };
}

describe("normalizeStoryboard", () => {
    test("assigns timing-compatible scene ids and trims narration", () => {
        const storyboard = normalizeStoryboard(
            {
                title: "How rivers form",
                scenes: [rawScene("Intro"), rawScene("Body"), rawScene("Recap")],
            },
            options,
        );

        expect(storyboard.scenes.map((scene) => scene.id)).toEqual([
            "s1",
            "s2",
            "s3",
        ]);
        expect(storyboard.scenes[0]?.narration).toBe(
            "Spoken narration for this scene.",
        );
        expect(storyboard.language).toBe("en");
    });

    test("records the locale the reader asked for", () => {
        const storyboard = normalizeStoryboard(
            {
                title: "Cómo se forman los ríos",
                scenes: [rawScene("Intro"), rawScene("Body"), rawScene("Recap")],
            },
            { ...options, locale: "es" },
        );

        expect(storyboard.language).toBe("es");
    });

    test("refuses a storyboard where no scene cites a source", () => {
        expect(() =>
            normalizeStoryboard(
                {
                    title: "Ungrounded",
                    scenes: [
                        rawScene("Intro", []),
                        rawScene("Body", []),
                        rawScene("Recap", []),
                    ],
                },
                options,
            ),
        ).toThrow(OutputGenerationError);
    });

    test("refuses a storyboard that is too short to narrate", () => {
        expect(() =>
            normalizeStoryboard(
                { title: "Too short", scenes: [rawScene("Only")] },
                options,
            ),
        ).toThrow(OutputGenerationError);
    });
});

describe("storyboardResponseSchemaFor", () => {
    test("rejects a marker outside this generation's labels", () => {
        const schema = storyboardResponseSchemaFor(sourceLabels, "short");
        const parsed = schema.safeParse({
            title: "Deck",
            scenes: [
                rawScene("One", ["S4"]),
                rawScene("Two"),
                rawScene("Three"),
                rawScene("Four"),
            ],
        });

        expect(parsed.success).toBe(false);
    });

    test("requires at least one cited scene", () => {
        const schema = storyboardResponseSchemaFor(sourceLabels, "short");
        const parsed = schema.safeParse({
            title: "Deck",
            scenes: [
                rawScene("One", []),
                rawScene("Two", []),
                rawScene("Three", []),
                rawScene("Four", []),
            ],
        });

        expect(parsed.success).toBe(false);
    });
});

describe("storyboardFingerprint", () => {
    test("is stable for the same work", () => {
        expect(storyboardFingerprint(sources, options)).toBe(
            storyboardFingerprint(sources, options),
        );
    });

    test("changes when a source is reprocessed", () => {
        expect(
            storyboardFingerprint(
                [{ sourceId: "src-1", processingVersion: 2 }],
                options,
            ),
        ).not.toBe(storyboardFingerprint(sources, options));
    });

    test("changes when the depth or voice changes", () => {
        expect(
            storyboardFingerprint(sources, { ...options, length: "deep" }),
        ).not.toBe(storyboardFingerprint(sources, options));
        expect(
            storyboardFingerprint(sources, {
                ...options,
                audio: { style: "narration", voice: "bright" },
            }),
        ).not.toBe(storyboardFingerprint(sources, options));
    });

    test("does not collide with an Audio Overview of the same work", async () => {
        const { scriptFingerprint } = await import("./audio-overview.service.js");
        expect(storyboardFingerprint(sources, options)).not.toBe(
            scriptFingerprint(sources, options),
        );
    });
});

describe("reusableStoryboard", () => {
    const storyboard = normalizeStoryboard(
        {
            title: "How rivers form",
            scenes: [rawScene("Intro"), rawScene("Body"), rawScene("Recap")],
        },
        options,
    );
    const content = { version: 1, storyboard };

    test("reuses a storyboard whose fingerprint still matches", () => {
        expect(reusableStoryboard(content, "abc", "abc")?.title).toBe(
            "How rivers form",
        );
    });

    test("rewrites when the fingerprint moved", () => {
        expect(reusableStoryboard(content, "abc", "def")).toBeNull();
    });

    test("rewrites when nothing was ever recorded", () => {
        expect(reusableStoryboard(content, undefined, "abc")).toBeNull();
        expect(reusableStoryboard(null, "abc", "abc")).toBeNull();
    });
});

describe("storedVideoPublicId", () => {
    const storyboard = normalizeStoryboard(
        {
            title: "How rivers form",
            scenes: [rawScene("Intro"), rawScene("Body"), rawScene("Recap")],
        },
        options,
    );

    test("finds media that a deletion has to retire", () => {
        const publicId = storedVideoPublicId({
            version: 1,
            storyboard,
            timings: [{ segmentId: "s1", startMs: 0, endMs: 1_000 }],
            media: {
                provider: "openai",
                model: "gpt-4o-mini-tts",
                voiceProfile: "warm",
                voices: ["sage"],
                format: "mp3",
                bytes: 1_024,
                durationMs: 1_000,
                storage: {
                    provider: "cloudinary",
                    publicId: "chaibook/audio/out-1",
                    resourceType: "video",
                },
                synthesizedAt: "2026-08-17T09:00:00.000Z",
            },
        });

        expect(publicId).toBe("chaibook/audio/out-1");
    });

    test("reports nothing when synthesis never finished", () => {
        expect(storedVideoPublicId({ version: 1, storyboard })).toBeNull();
        expect(storedVideoPublicId(null)).toBeNull();
    });
});

describe("buildVideoSummary", () => {
    const storyboard = normalizeStoryboard(
        {
            title: "How rivers form",
            scenes: [rawScene("Intro"), rawScene("Body"), rawScene("Recap")],
        },
        options,
    );

    test("denormalizes the facts a Studio card shows", () => {
        const summary = buildVideoSummary(
            { version: 1, storyboard },
            options,
            "a".repeat(64),
        );

        expect(summary).toEqual({
            voice: "warm",
            language: "en",
            sceneCount: 3,
            storyboardFingerprint: "a".repeat(64),
        });
    });
});

describe("buildStoryboardSystemPrompt", () => {
    test("keeps on-screen text and spoken narration separate", () => {
        const prompt = buildStoryboardSystemPrompt(options, sourceLabels);

        expect(prompt).toContain("they must do different jobs");
        expect(prompt).toContain("no markdown");
        expect(prompt).toContain("S1 = Field guide");
    });
});
