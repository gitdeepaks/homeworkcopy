import { describe, expect, test } from "bun:test";
import type {
    AudioOverviewScript,
    OutputFailureCode,
    OutputFailureStage,
    OutputGenerationOptions,
} from "@homeworkcopy/contracts";
import {
    alignTimingsToStoredAudio,
    audioOptionsOf,
    buildAudioSummary,
    buildTimings,
    normalizeScript,
    reusableScript,
    scriptFingerprint,
    storedAudioPublicId,
    synthesizeScript,
} from "./audio-overview.service.js";
import { concatAudio } from "../lib/audio/mp3.js";
import { OutputGenerationError } from "../types/app-error.js";
import type {
    SpeechRequest,
    SynthesizedSpeech,
    TextToSpeechProvider,
} from "../lib/tts/types.js";

const OPTIONS: OutputGenerationOptions = {
    version: 1,
    length: "standard",
    locale: "en",
    audio: { style: "narration", voice: "warm" },
};

const SOURCES = [{ sourceId: "source-1", processingVersion: 1 }];

/** One MPEG1 Layer III frame: 417 bytes, 26.122 ms. */
function frame(): Uint8Array {
    const bytes = new Uint8Array(417);
    bytes[0] = 0xff;
    bytes[1] = 0xfb;
    bytes[2] = 0x90;
    bytes[3] = 0xc4;
    return bytes;
}

function fakeProvider(
    overrides: Partial<TextToSpeechProvider> & {
        frames?: number;
        onSynthesize?: (request: SpeechRequest) => void;
    } = {},
): TextToSpeechProvider {
    const frames = overrides.frames ?? 1;

    return {
        id: overrides.id ?? "fake",
        model: overrides.model ?? "fake-tts",
        maxInputLength: overrides.maxInputLength ?? 4_096,
        synthesize:
            overrides.synthesize ??
            ((request: SpeechRequest): Promise<SynthesizedSpeech> => {
                overrides.onSynthesize?.(request);
                return Promise.resolve({
                    audio: concatAudio(
                        Array.from({ length: frames }, () => frame()),
                    ),
                    format: "mp3",
                    voiceId: `voice-${request.speaker}`,
                });
            }),
    };
}

/** Asserts a pipeline stage failed with the exact code it must report. */
async function expectFailure(
    task: Promise<unknown>,
    code: OutputFailureCode,
    stage: OutputFailureStage,
): Promise<void> {
    try {
        await task;
    } catch (error) {
        expect(error).toBeInstanceOf(OutputGenerationError);
        if (error instanceof OutputGenerationError) {
            expect(error.failureCode).toBe(code);
            expect(error.stage).toBe(stage);
        }
        return;
    }

    throw new Error(`Expected the task to fail with ${code}`);
}

function script(overrides: Partial<AudioOverviewScript> = {}) {
    const base: AudioOverviewScript = {
        style: "narration",
        language: "en",
        segments: [
            { id: "s1", speaker: "host", text: "Intro.", sourceLabels: [] },
            {
                id: "s2",
                speaker: "host",
                text: "The study found X.",
                sourceLabels: ["S1"],
            },
        ],
    };
    return { ...base, ...overrides };
}

describe("audioOptionsOf", () => {
    test("falls back to the documented defaults", () => {
        expect(
            audioOptionsOf({ version: 1, length: "short", locale: "en" }),
        ).toEqual({ style: "narration", voice: "warm" });
        expect(audioOptionsOf(OPTIONS)).toEqual({
            style: "narration",
            voice: "warm",
        });
    });
});

describe("scriptFingerprint", () => {
    test("is stable regardless of source order", () => {
        const a = scriptFingerprint(
            [
                { sourceId: "b", processingVersion: 1 },
                { sourceId: "a", processingVersion: 2 },
            ],
            OPTIONS,
        );
        const b = scriptFingerprint(
            [
                { sourceId: "a", processingVersion: 2 },
                { sourceId: "b", processingVersion: 1 },
            ],
            OPTIONS,
        );

        expect(a).toBe(b);
        expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    test("changes when a source is reprocessed or an option changes", () => {
        const base = scriptFingerprint(SOURCES, OPTIONS);

        expect(
            scriptFingerprint(
                [{ sourceId: "source-1", processingVersion: 2 }],
                OPTIONS,
            ),
        ).not.toBe(base);
        expect(scriptFingerprint(SOURCES, { ...OPTIONS, length: "deep" })).not.toBe(
            base,
        );
        expect(
            scriptFingerprint(SOURCES, {
                ...OPTIONS,
                audio: { style: "dialogue", voice: "warm" },
            }),
        ).not.toBe(base);
    });
});

describe("normalizeScript", () => {
    test("assigns contiguous ids and drops duplicate labels", () => {
        const normalized = normalizeScript(
            [
                { speaker: "host", text: " Intro. ", sourceLabels: [] },
                {
                    speaker: "guest",
                    text: "Detail.",
                    sourceLabels: ["S1", "S1", "S2"],
                },
            ],
            OPTIONS,
        );

        expect(normalized.segments.map((segment) => segment.id)).toEqual([
            "s1",
            "s2",
        ]);
        expect(normalized.segments[1]?.sourceLabels).toEqual(["S1", "S2"]);
        expect(normalized.segments[0]?.text).toBe("Intro.");
    });

    test("forces one voice for styles that are not conversations", () => {
        const narration = normalizeScript(
            [
                { speaker: "guest", text: "One.", sourceLabels: ["S1"] },
                { speaker: "guest", text: "Two.", sourceLabels: [] },
            ],
            OPTIONS,
        );
        expect(
            narration.segments.every((segment) => segment.speaker === "host"),
        ).toBeTrue();

        const dialogue = normalizeScript(
            [
                { speaker: "host", text: "Question?", sourceLabels: [] },
                { speaker: "guest", text: "Answer.", sourceLabels: ["S1"] },
            ],
            { ...OPTIONS, audio: { style: "dialogue", voice: "bright" } },
        );
        expect(dialogue.segments.map((segment) => segment.speaker)).toEqual([
            "host",
            "guest",
        ]);
    });

    test("refuses a script where nothing is attributed to a source", () => {
        expect(() =>
            normalizeScript(
                [
                    { speaker: "host", text: "One.", sourceLabels: [] },
                    { speaker: "host", text: "Two.", sourceLabels: [] },
                ],
                OPTIONS,
            ),
        ).toThrow(OutputGenerationError);
    });
});

describe("reusableScript", () => {
    const content = { version: 1, script: script() };
    const fingerprint = "a".repeat(64);

    test("reuses a script written for the same work", () => {
        expect(reusableScript(content, fingerprint, fingerprint)).toEqual(
            script(),
        );
    });

    test("rewrites when the fingerprint is missing or has moved on", () => {
        expect(reusableScript(content, undefined, fingerprint)).toBeNull();
        expect(reusableScript(content, "b".repeat(64), fingerprint)).toBeNull();
        expect(reusableScript(null, fingerprint, fingerprint)).toBeNull();
    });
});

describe("storedAudioPublicId", () => {
    test("finds media a delete or cancellation must retire", () => {
        expect(
            storedAudioPublicId({
                version: 1,
                script: script(),
                timings: [{ segmentId: "s1", startMs: 0, endMs: 10 }],
                media: {
                    provider: "openai",
                    model: "gpt-4o-mini-tts",
                    voiceProfile: "warm",
                    voices: ["sage"],
                    format: "mp3",
                    bytes: 10,
                    durationMs: 10,
                    storage: {
                        provider: "cloudinary",
                        publicId: "chaibook/audio/output-1",
                        resourceType: "video",
                    },
                    synthesizedAt: "2026-08-16T10:00:00.000Z",
                },
            }),
        ).toBe("chaibook/audio/output-1");
    });

    test("returns null for a script that has not been synthesized", () => {
        expect(storedAudioPublicId({ version: 1, script: script() })).toBeNull();
        expect(storedAudioPublicId(undefined)).toBeNull();
    });
});

describe("buildTimings", () => {
    test("lays segments end to end", () => {
        expect(buildTimings(["s1", "s2", "s3"], [1_000, 2_500, 500])).toEqual([
            { segmentId: "s1", startMs: 0, endMs: 1_000 },
            { segmentId: "s2", startMs: 1_000, endMs: 3_500 },
            { segmentId: "s3", startMs: 3_500, endMs: 4_000 },
        ]);
    });
});

describe("alignTimingsToStoredAudio", () => {
    const timings = [
        { segmentId: "s1", startMs: 0, endMs: 4_000 },
        { segmentId: "s2", startMs: 4_000, endMs: 10_000 },
    ];

    test("stretches the timeline onto the duration actually served", () => {
        expect(alignTimingsToStoredAudio(timings, 10_000, 10_100)).toEqual([
            { segmentId: "s1", startMs: 0, endMs: 4_040 },
            { segmentId: "s2", startMs: 4_040, endMs: 10_100 },
        ]);
    });

    test("keeps the measured timeline when the store reports nothing", () => {
        expect(alignTimingsToStoredAudio(timings, 10_000, null)).toEqual(
            timings,
        );
        expect(alignTimingsToStoredAudio(timings, 0, 10_000)).toEqual(timings);
    });

    test("refuses to stretch onto an implausible duration", () => {
        expect(alignTimingsToStoredAudio(timings, 10_000, 30_000)).toEqual(
            timings,
        );
        expect(alignTimingsToStoredAudio(timings, 10_000, 1_000)).toEqual(
            timings,
        );
    });

    test("pins the last segment to the end of the file", () => {
        const aligned = alignTimingsToStoredAudio(timings, 10_000, 9_900);
        expect(aligned[aligned.length - 1]?.endMs).toBe(9_900);
    });
});

describe("synthesizeScript", () => {
    const current = () => Promise.resolve(true);

    test("assembles one file with a timeline over every segment", async () => {
        const result = await synthesizeScript(
            script(),
            OPTIONS,
            fakeProvider({ frames: 2 }),
            current,
        );

        expect(result).not.toBeNull();
        expect(result?.audio.byteLength).toBe(417 * 4);
        expect(result?.durationMs).toBe(104);
        expect(result?.timings).toEqual([
            { segmentId: "s1", startMs: 0, endMs: 52 },
            { segmentId: "s2", startMs: 52, endMs: 104 },
        ]);
        expect(result?.voices).toEqual(["voice-host"]);
    });

    test("passes each speaker its own delivery direction", async () => {
        const requests: SpeechRequest[] = [];
        await synthesizeScript(
            script({
                style: "dialogue",
                segments: [
                    {
                        id: "s1",
                        speaker: "host",
                        text: "Question?",
                        sourceLabels: [],
                    },
                    {
                        id: "s2",
                        speaker: "guest",
                        text: "Answer.",
                        sourceLabels: ["S1"],
                    },
                ],
            }),
            { ...OPTIONS, audio: { style: "dialogue", voice: "bright" } },
            fakeProvider({ onSynthesize: (request) => requests.push(request) }),
            current,
        );

        expect(requests.map((request) => request.speaker)).toEqual([
            "host",
            "guest",
        ]);
        expect(requests.every((request) => request.voiceProfile === "bright")).toBeTrue();
        expect(requests[0]?.direction).not.toBe(requests[1]?.direction);
    });

    test("stops before paying the provider once the attempt is superseded", async () => {
        let calls = 0;
        const result = await synthesizeScript(
            script(),
            OPTIONS,
            fakeProvider({
                synthesize: () => {
                    calls += 1;
                    return Promise.resolve({
                        audio: frame(),
                        format: "mp3",
                        voiceId: "voice",
                    });
                },
            }),
            () => Promise.resolve(false),
        );

        expect(result).toBeNull();
        expect(calls).toBe(0);
    });

    test("reports a provider failure as a retriable synthesis failure", async () => {
        await expectFailure(
            synthesizeScript(
                script(),
                OPTIONS,
                fakeProvider({
                    synthesize: () =>
                        Promise.reject(new Error("429 rate limited")),
                }),
                current,
            ),
            "SYNTHESIS_FAILED",
            "SYNTHESIS",
        );

        expect(
            new OutputGenerationError(
                "SYNTHESIS",
                "SYNTHESIS_FAILED",
                "rate limited",
            ).isRetriable,
        ).toBeTrue();
    });

    test("refuses audio it cannot measure rather than guessing the timeline", async () => {
        await expectFailure(
            synthesizeScript(
                script(),
                OPTIONS,
                fakeProvider({
                    synthesize: () =>
                        Promise.resolve({
                            audio: new Uint8Array([0, 1, 2, 3]),
                            format: "mp3",
                            voiceId: "voice",
                        }),
                }),
                current,
            ),
            "AUDIO_ASSEMBLY_FAILED",
            "ASSEMBLY",
        );
    });

    test("rejects a segment the provider could not accept in one request", async () => {
        await expectFailure(
            synthesizeScript(
                script({
                    segments: [
                        {
                            id: "s1",
                            speaker: "host",
                            text: "x".repeat(200),
                            sourceLabels: ["S1"],
                        },
                        {
                            id: "s2",
                            speaker: "host",
                            text: "Short.",
                            sourceLabels: [],
                        },
                    ],
                }),
                OPTIONS,
                fakeProvider({ maxInputLength: 100 }),
                current,
            ),
            "SYNTHESIS_FAILED",
            "SYNTHESIS",
        );
    });
});

describe("buildAudioSummary", () => {
    test("carries the facts a Studio card shows without parsing a script", () => {
        const fingerprint = "c".repeat(64);
        const summary = buildAudioSummary(
            { version: 1, script: script() },
            OPTIONS,
            fingerprint,
        );

        expect(summary).toEqual({
            style: "narration",
            voice: "warm",
            language: "en",
            segmentCount: 2,
            scriptFingerprint: fingerprint,
        });
    });
});
