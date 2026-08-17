import { describe, expect, test } from "bun:test";
import {
    createNoteRequestSchema,
    noteCitationEnvelopeSchema,
    NOTES_PARTICIPATE_IN_GROUNDING,
    NOTE_CONTENT_MAX_LENGTH,
    readNoteCitations,
    readNoteSavedFrom,
    updateNoteRequestSchema,
} from "./index";

const citation = {
    sourceId: "src-1",
    sourceType: "PDF" as const,
    title: "Thermodynamics",
    excerpt: "Entropy never decreases in an isolated system.",
    page: 12,
    chunkId: "chunk-3",
};

describe("notes and grounding", () => {
    test("notes stay outside the grounding path", () => {
        expect(NOTES_PARTICIPATE_IN_GROUNDING).toBe(false);
    });
});

describe("createNoteRequestSchema", () => {
    test("defaults origin to MANUAL", () => {
        const parsed = createNoteRequestSchema.parse({ content: "A thought" });
        expect(parsed.origin).toBe("MANUAL");
        expect(parsed.title).toBeUndefined();
    });

    test("accepts an excerpt saved from a chat answer", () => {
        const parsed = createNoteRequestSchema.parse({
            content: "Worth remembering",
            origin: "CHAT",
            citations: [citation],
            savedFrom: {
                kind: "chat",
                conversationId: "conv-1",
                messageId: "msg-1",
            },
        });

        expect(parsed.citations).toHaveLength(1);
        expect(parsed.savedFrom).toEqual({
            kind: "chat",
            conversationId: "conv-1",
            messageId: "msg-1",
        });
    });

    test("rejects an empty body", () => {
        expect(createNoteRequestSchema.safeParse({ content: "   " }).success).toBe(
            false,
        );
    });

    test("rejects a body beyond the limit", () => {
        const parsed = createNoteRequestSchema.safeParse({
            content: "x".repeat(NOTE_CONTENT_MAX_LENGTH + 1),
        });
        expect(parsed.success).toBe(false);
    });

    test("rejects an unknown saved-from kind", () => {
        const parsed = createNoteRequestSchema.safeParse({
            content: "A thought",
            savedFrom: { kind: "elsewhere", id: "x" },
        });
        expect(parsed.success).toBe(false);
    });
});

describe("updateNoteRequestSchema", () => {
    test("requires at least one field", () => {
        expect(updateNoteRequestSchema.safeParse({}).success).toBe(false);
    });

    test("accepts clearing citations with an empty list", () => {
        const parsed = updateNoteRequestSchema.parse({ citations: [] });
        expect(parsed.citations).toEqual([]);
    });
});

describe("noteCitationEnvelopeSchema", () => {
    test("rejects duplicate citations of the same excerpt", () => {
        const parsed = noteCitationEnvelopeSchema.safeParse({
            version: 1,
            items: [citation, citation],
        });
        expect(parsed.success).toBe(false);
    });

    test("keeps two excerpts from the same source", () => {
        const parsed = noteCitationEnvelopeSchema.safeParse({
            version: 1,
            items: [citation, { ...citation, chunkId: "chunk-4" }],
        });
        expect(parsed.success).toBe(true);
    });
});

describe("readNoteCitations", () => {
    test("reads a stored envelope", () => {
        expect(
            readNoteCitations({ version: 1, items: [citation] }),
        ).toHaveLength(1);
    });

    test("returns nothing for an absent or unreadable column", () => {
        expect(readNoteCitations(null)).toEqual([]);
        expect(readNoteCitations(undefined)).toEqual([]);
        expect(readNoteCitations({ version: 99, items: [] })).toEqual([]);
    });
});

describe("readNoteSavedFrom", () => {
    test("reads an output origin", () => {
        expect(readNoteSavedFrom({ kind: "output", outputId: "out-1" })).toEqual(
            { kind: "output", outputId: "out-1" },
        );
    });

    test("returns null for a hand-written note", () => {
        expect(readNoteSavedFrom(null)).toBeNull();
    });
});
