import { describe, expect, test } from "bun:test";
import {
    createOutputRequestSchema,
    OUTPUT_TYPE_GROUP,
    OUTPUT_TYPES,
    outputGenerationOptionsInputSchema,
    outputMetadataSchema,
    parseOutputContent,
    readOutputMetadata,
    type OutputMetadata,
} from "./index";

describe("output generation options", () => {
    test("applies standard defaults when options are omitted", () => {
        expect(outputGenerationOptionsInputSchema.parse({})).toEqual({
            length: "standard",
            locale: "en",
        });
    });

    test("rejects unsupported locales and oversized focus text", () => {
        expect(
            outputGenerationOptionsInputSchema.safeParse({ locale: "english" })
                .success,
        ).toBeFalse();
        expect(
            outputGenerationOptionsInputSchema.safeParse({
                focus: "x".repeat(501),
            }).success,
        ).toBeFalse();
        expect(
            outputGenerationOptionsInputSchema.parse({ locale: "en-GB" }).locale,
        ).toBe("en-GB");
    });
});

describe("create output request", () => {
    test("requires a selection alongside the output type", () => {
        expect(
            createOutputRequestSchema.parse({
                type: "STUDY_GUIDE",
                selectionMode: "custom",
                sourceIds: ["source-1"],
            }),
        ).toMatchObject({ type: "STUDY_GUIDE", selectionMode: "custom" });
        expect(
            createOutputRequestSchema.safeParse({ type: "STUDY_GUIDE" }).success,
        ).toBeFalse();
        expect(
            createOutputRequestSchema.safeParse({
                type: "AUDIO_OVERVIEW",
                selectionMode: "all-ready",
                sourceIds: [],
            }).success,
        ).toBeFalse();
    });
});

describe("output type grouping", () => {
    test("every output type has a studio shelf", () => {
        for (const type of OUTPUT_TYPES) {
            expect(OUTPUT_TYPE_GROUP[type]).toBeString();
        }
    });
});

describe("output content parsing", () => {
    test("accepts well-formed content per type", () => {
        expect(
            parseOutputContent("SUMMARY", { markdown: "# Notes" }),
        ).toEqual({ type: "SUMMARY", data: { markdown: "# Notes" } });
        expect(
            parseOutputContent("FAQ", {
                items: [
                    { question: "q1", answer: "a1" },
                    { question: "q2", answer: "a2" },
                    { question: "q3", answer: "a3" },
                ],
            }),
        ).not.toBeNull();
    });

    test("rejects malformed structured content", () => {
        expect(parseOutputContent("SUMMARY", { markdown: "" })).toBeNull();
        expect(parseOutputContent("SUMMARY", null)).toBeNull();
        expect(
            parseOutputContent("QUIZ", {
                questions: [
                    {
                        question: "q",
                        options: ["a", "b"],
                        correctIndex: 5,
                        explanation: "e",
                    },
                ],
            }),
        ).toBeNull();
    });
});

describe("output metadata", () => {
    test("round-trips the versioned envelope", () => {
        const metadata: OutputMetadata = {
            version: 1,
            model: "gpt-4o-mini",
            provider: "openai",
            generatedAt: "2026-08-15T10:00:00.000Z",
            options: { version: 1, length: "deep", locale: "en" },
            metrics: {
                contextChars: 120,
                durationMs: 900,
                attempts: 1,
                repairAttempts: 0,
            },
        };
        expect(outputMetadataSchema.parse(metadata)).toEqual(metadata);
        expect(readOutputMetadata(metadata)).toEqual(metadata);
    });

    test("upgrades pre-Phase-7 metadata in memory", () => {
        expect(
            readOutputMetadata({ processingError: "Model refused" }),
        ).toEqual({
            version: 1,
            failure: {
                stage: "GENERATION",
                code: "GENERATION_FAILED",
                message: "Model refused",
            },
        });
        expect(
            readOutputMetadata({
                savedFromConversationId: "conv-1",
                savedFromMessageId: "msg-1",
            }),
        ).toEqual({
            version: 1,
            savedFrom: { conversationId: "conv-1", messageId: "msg-1" },
        });
        expect(readOutputMetadata(null)).toBeNull();
    });
});
