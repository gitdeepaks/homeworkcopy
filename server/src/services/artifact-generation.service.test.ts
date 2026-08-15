import { describe, expect, test } from "bun:test";
import { gatherSourceContext } from "./artifact-generation.service.js";
import { OutputGenerationError } from "../types/app-error.js";
import type { SourceRecord } from "../repositories/source.repository.js";

function source(overrides: Partial<SourceRecord> & { id: string }): SourceRecord {
    return {
        workspaceId: "notebook-1",
        type: "TEXT",
        title: `Source ${overrides.id}`,
        content: "Body text",
        url: null,
        status: "READY",
        processingStage: "READY",
        processingVersion: 1,
        contentChecksum: null,
        metadata: null,
        createdAt: new Date("2026-08-15T00:00:00.000Z"),
        updatedAt: new Date("2026-08-15T00:00:00.000Z"),
        ...overrides,
    };
}

describe("gatherSourceContext", () => {
    test("concatenates every source that has extracted content", () => {
        const context = gatherSourceContext([
            source({ id: "a", title: "Alpha", content: "First body" }),
            source({ id: "b", title: "Beta", content: "Second body" }),
        ]);

        expect(context.sourceIds).toEqual(["a", "b"]);
        expect(context.text).toContain("# [S1] Alpha");
        expect(context.text).toContain("Second body");
        expect(context.contextChars).toBe(context.text.length);
    });

    test("labels only the sources the model can actually see", () => {
        const context = gatherSourceContext([
            source({ id: "a", title: "Alpha", content: null }),
            source({ id: "b", title: "Beta", content: "Second body" }),
            source({ id: "c", title: "Gamma", content: "Third body" }),
        ]);

        expect(context.sourceLabels).toEqual([
            { label: "S1", sourceId: "b", title: "Beta" },
            { label: "S2", sourceId: "c", title: "Gamma" },
        ]);
        expect(context.text).not.toContain("Alpha");
    });

    test("caps the context so a large notebook cannot blow the prompt budget", () => {
        const context = gatherSourceContext([
            source({ id: "a", content: "x".repeat(200_000) }),
        ]);
        expect(context.text.length).toBe(120_000);
    });

    test("fails with NO_SOURCE_CONTENT when nothing was extracted", () => {
        expect(() =>
            gatherSourceContext([
                source({ id: "a", content: null }),
                source({ id: "b", content: "   " }),
            ]),
        ).toThrow(OutputGenerationError);

        try {
            gatherSourceContext([source({ id: "a", content: null })]);
        } catch (error) {
            expect(error).toBeInstanceOf(OutputGenerationError);
            if (error instanceof OutputGenerationError) {
                expect(error.failureCode).toBe("NO_SOURCE_CONTENT");
                expect(error.stage).toBe("CONTEXT_ASSEMBLY");
            }
        }
    });

    test("fails rather than generating from an empty selection", () => {
        expect(() => gatherSourceContext([])).toThrow(OutputGenerationError);
    });
});
