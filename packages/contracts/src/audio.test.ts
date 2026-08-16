import { describe, expect, test } from "bun:test";
import {
    audioOverviewOutputContentSchema,
    audioOverviewScriptSchema,
    audioSegmentTimingSchema,
    outputAudioAccessSchema,
    parseOutputContent,
    parsePlayableAudioOverview,
    type AudioMedia,
    type AudioOverviewScript,
} from "./index";

const script: AudioOverviewScript = {
    style: "narration",
    language: "en",
    segments: [
        { id: "s1", speaker: "host", text: "Welcome.", sourceLabels: [] },
        {
            id: "s2",
            speaker: "host",
            text: "The paper argues X.",
            sourceLabels: ["S1"],
        },
    ],
};

const media: AudioMedia = {
    provider: "openai",
    model: "gpt-4o-mini-tts",
    voiceProfile: "warm",
    voices: ["alloy"],
    format: "mp3",
    bytes: 4096,
    durationMs: 32_000,
    storage: {
        provider: "cloudinary",
        publicId: "chaibook/audio/output-1",
        resourceType: "video",
    },
    synthesizedAt: "2026-08-16T10:00:00.000Z",
};

describe("audio overview script", () => {
    test("accepts a grounded script", () => {
        expect(audioOverviewScriptSchema.parse(script)).toEqual(script);
    });

    test("rejects a script where nothing is attributed to a source", () => {
        expect(
            audioOverviewScriptSchema.safeParse({
                ...script,
                segments: script.segments.map((segment) => ({
                    ...segment,
                    sourceLabels: [],
                })),
            }).success,
        ).toBeFalse();
    });

    test("rejects duplicate segment ids and duplicate labels", () => {
        expect(
            audioOverviewScriptSchema.safeParse({
                ...script,
                segments: [script.segments[0], script.segments[0]],
            }).success,
        ).toBeFalse();
        expect(
            audioOverviewScriptSchema.safeParse({
                ...script,
                segments: [
                    script.segments[0],
                    { ...script.segments[1], sourceLabels: ["S1", "S1"] },
                ],
            }).success,
        ).toBeFalse();
    });

    test("rejects segment text a TTS request could not carry", () => {
        expect(
            audioOverviewScriptSchema.safeParse({
                ...script,
                segments: [
                    script.segments[0],
                    { ...script.segments[1], text: "x".repeat(1_201) },
                ],
            }).success,
        ).toBeFalse();
    });
});

describe("audio overview content", () => {
    test("reads a script-only record while synthesis is still pending", () => {
        const content = { version: 1 as const, script };

        expect(audioOverviewOutputContentSchema.parse(content)).toEqual(content);
        expect(parseOutputContent("AUDIO_OVERVIEW", content)).toEqual({
            type: "AUDIO_OVERVIEW",
            data: content,
        });
        expect(parsePlayableAudioOverview(content)).toBeNull();
    });

    test("reads a finished record as playable", () => {
        const content = {
            version: 1 as const,
            script,
            timings: [
                { segmentId: "s1", startMs: 0, endMs: 4_000 },
                { segmentId: "s2", startMs: 4_000, endMs: 32_000 },
            ],
            media,
        };

        expect(parsePlayableAudioOverview(content)).toEqual(content);
    });

    test("rejects media without durable storage coordinates", () => {
        expect(
            parsePlayableAudioOverview({
                version: 1,
                script,
                timings: [{ segmentId: "s1", startMs: 0, endMs: 1 }],
                media: { ...media, storage: undefined },
            }),
        ).toBeNull();
        expect(parsePlayableAudioOverview(null)).toBeNull();
    });

    test("rejects a segment that ends before it starts", () => {
        expect(
            audioSegmentTimingSchema.safeParse({
                segmentId: "s1",
                startMs: 900,
                endMs: 100,
            }).success,
        ).toBeFalse();
    });
});

describe("audio access response", () => {
    test("requires signed https urls and an expiry", () => {
        const access = {
            version: 1 as const,
            playbackUrl: "https://res.cloudinary.com/demo/video/authenticated/a.mp3",
            downloadUrl: "https://api.cloudinary.com/v1_1/demo/video/download?x=1",
            expiresAt: "2026-08-16T10:10:00.000Z",
            format: "mp3" as const,
            bytes: 4096,
            durationMs: 32_000,
        };

        expect(outputAudioAccessSchema.parse(access)).toEqual(access);
        expect(
            outputAudioAccessSchema.safeParse({
                ...access,
                playbackUrl: "http://res.cloudinary.com/demo/a.mp3",
            }).success,
        ).toBeFalse();
    });
});
