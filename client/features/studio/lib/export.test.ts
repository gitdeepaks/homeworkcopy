import { describe, expect, test } from "bun:test";
import { outputFileName, outputToMarkdown } from "./export";
import type { StudioOutput } from "./types";

function output(overrides: Partial<StudioOutput>): StudioOutput {
    return {
        id: "output-1",
        workspaceId: "notebook-1",
        type: "SUMMARY",
        title: "Cell biology summary",
        content: { markdown: "## Cells\n\nCells are the unit of life." },
        contentVersion: 1,
        sourceIds: ["source-1"],
        status: "READY",
        stage: "READY",
        attemptCount: 1,
        cancelledAt: null,
        metadata: {
            version: 1,
            sourceSnapshot: {
                version: 1,
                capturedAt: "2026-08-15T10:00:00.000Z",
                selectionMode: "custom",
                sources: [
                    {
                        id: "source-1",
                        title: "Biology chapter 2",
                        type: "PDF",
                        processingVersion: 1,
                    },
                ],
            },
        },
        createdAt: "2026-08-15T10:00:00.000Z",
        updatedAt: "2026-08-15T10:00:00.000Z",
        ...overrides,
    };
}

describe("outputToMarkdown", () => {
    test("includes the title, the body, and the sources used", () => {
        const markdown = outputToMarkdown(output({}));
        expect(markdown).toContain("# Cell biology summary");
        expect(markdown).toContain("Cells are the unit of life.");
        expect(markdown).toContain("## Sources");
        expect(markdown).toContain("- Biology chapter 2");
    });

    test("marks the correct quiz option", () => {
        const markdown = outputToMarkdown(
            output({
                type: "QUIZ",
                content: {
                    questions: [
                        {
                            question: "What is ATP?",
                            options: ["Energy currency", "A protein"],
                            correctIndex: 0,
                            explanation: "It carries chemical energy.",
                        },
                        {
                            question: "Where is DNA stored?",
                            options: ["Nucleus", "Ribosome"],
                            correctIndex: 0,
                            explanation: "In eukaryotes, in the nucleus.",
                        },
                        {
                            question: "What do ribosomes do?",
                            options: ["Build proteins", "Store lipids"],
                            correctIndex: 0,
                            explanation: "They translate mRNA.",
                        },
                    ],
                },
            }),
        );
        expect(markdown).toContain("- [x] Energy currency");
        expect(markdown).toContain("- [ ] A protein");
    });

    test("indents a mind map as an outline", () => {
        const markdown = outputToMarkdown(
            output({
                type: "MINDMAP",
                content: {
                    nodes: [
                        { id: "root", label: "Cells" },
                        { id: "child", label: "Organelles" },
                    ],
                    edges: [{ id: "e1", source: "root", target: "child" }],
                },
            }),
        );
        expect(markdown).toContain("- Cells");
        expect(markdown).toContain("  - Organelles");
    });

    test("exports an Audio Overview as a readable, cited transcript", () => {
        const markdown = outputToMarkdown(
            output({
                type: "AUDIO_OVERVIEW",
                title: "Cell biology walkthrough",
                content: {
                    version: 1,
                    script: {
                        style: "dialogue",
                        language: "en",
                        segments: [
                            {
                                id: "s1",
                                speaker: "host",
                                text: "What makes a cell a cell?",
                                sourceLabels: [],
                            },
                            {
                                id: "s2",
                                speaker: "guest",
                                text: "A membrane, a genome, and a metabolism.",
                                sourceLabels: ["S1"],
                            },
                        ],
                    },
                },
            }),
        );

        expect(markdown).toContain("## Transcript");
        expect(markdown).toContain("**Host:** What makes a cell a cell?");
        expect(markdown).toContain(
            "**Guest:** A membrane, a genome, and a metabolism. [S1]",
        );
        expect(markdown).toContain("audio pending");
    });

    test("explains an output that has no content yet", () => {
        expect(
            outputToMarkdown(output({ status: "PENDING", content: null })),
        ).toContain("no generated content yet");
    });

    test("falls back when the stored content does not match its type", () => {
        expect(
            outputToMarkdown(output({ type: "FAQ", content: { items: [] } })),
        ).toContain("no generated content yet");
    });
});

describe("outputFileName", () => {
    test("slugifies the title", () => {
        expect(outputFileName(output({}))).toBe("cell-biology-summary.md");
    });

    test("always produces a usable name", () => {
        expect(outputFileName(output({ title: "···" }))).toBe("output.md");
    });
});
