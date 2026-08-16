import { describe, expect, test } from "bun:test";
import { groupOutputs, shelfForOutput } from "./grouping";
import type { StudioOutput } from "./types";

function output(overrides: Partial<StudioOutput> & { id: string }): StudioOutput {
    return {
        workspaceId: "notebook-1",
        type: "SUMMARY",
        title: `Output ${overrides.id}`,
        content: null,
        contentVersion: 1,
        sourceIds: ["source-1"],
        status: "READY",
        stage: "READY",
        attemptCount: 1,
        cancelledAt: null,
        metadata: null,
        createdAt: "2026-08-15T10:00:00.000Z",
        updatedAt: "2026-08-15T10:00:00.000Z",
        ...overrides,
    };
}

describe("shelfForOutput", () => {
    test("places study and writing types on their own shelves", () => {
        expect(shelfForOutput(output({ id: "a", type: "FLASHCARDS" }))).toBe(
            "study",
        );
        expect(shelfForOutput(output({ id: "b", type: "BRIEFING" }))).toBe(
            "writing",
        );
    });

    test("answers saved from chat go to the saved shelf", () => {
        expect(
            shelfForOutput(
                output({
                    id: "c",
                    type: "SUMMARY",
                    metadata: {
                        version: 1,
                        savedFrom: {
                            conversationId: "conv-1",
                            messageId: "msg-1",
                        },
                    },
                }),
            ),
        ).toBe("saved");
    });

    test("reads pre-Phase-7 saved answers too", () => {
        expect(
            shelfForOutput(
                output({
                    id: "d",
                    metadata: {
                        savedFromConversationId: "conv-1",
                        savedFromMessageId: "msg-1",
                    },
                }),
            ),
        ).toBe("saved");
    });
});

describe("groupOutputs", () => {
    test("returns only non-empty shelves in display order", () => {
        const shelves = groupOutputs([
            output({ id: "a", type: "REPORT" }),
            output({ id: "b", type: "QUIZ" }),
            output({ id: "c", type: "STUDY_GUIDE" }),
        ]);

        expect(shelves.map((shelf) => shelf.group)).toEqual([
            "study",
            "writing",
        ]);
        expect(shelves[0]?.outputs.map((item) => item.id)).toEqual(["b", "c"]);
        expect(shelves[1]?.outputs.map((item) => item.id)).toEqual(["a"]);
    });

    test("handles an empty notebook", () => {
        expect(groupOutputs([])).toEqual([]);
    });
});
