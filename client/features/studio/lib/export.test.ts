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

    test("exports a slide deck with its notes and attributions", () => {
        const markdown = outputToMarkdown(
            output({
                type: "SLIDES",
                title: "Cell biology deck",
                content: {
                    version: 1,
                    deck: {
                        title: "Cell biology",
                        subtitle: "A ten minute tour",
                        slides: [
                            {
                                id: "sl1",
                                title: "What a cell is",
                                bullets: ["A membrane", "A genome"],
                                speakerNotes: "Open with the membrane.",
                                sourceLabels: ["S1"],
                            },
                            {
                                id: "sl2",
                                title: "Organelles",
                                bullets: ["Mitochondria"],
                                sourceLabels: [],
                            },
                            {
                                id: "sl3",
                                title: "Recap",
                                bullets: ["Three ideas"],
                                sourceLabels: [],
                            },
                        ],
                    },
                },
            }),
        );

        expect(markdown).toContain("_A ten minute tour_");
        expect(markdown).toContain("## Slide 1: What a cell is");
        expect(markdown).toContain("- A membrane");
        expect(markdown).toContain("**Notes:** Open with the membrane.");
        expect(markdown).toContain("_Sources: [S1]_");
    });

    test("exports data tables as Markdown tables with a sources column", () => {
        const markdown = outputToMarkdown(
            output({
                type: "DATA_TABLE",
                title: "Phase comparison",
                content: {
                    version: 1,
                    tables: [
                        {
                            id: "t1",
                            title: "Mitosis phases",
                            columns: [
                                { label: "Phase", kind: "text" },
                                { label: "Marker", kind: "text" },
                            ],
                            rows: [
                                {
                                    id: "r1",
                                    cells: ["Prophase", "Chromosomes | condense"],
                                    sourceLabels: ["S1"],
                                },
                                {
                                    id: "r2",
                                    cells: ["Metaphase", ""],
                                    sourceLabels: [],
                                },
                            ],
                        },
                    ],
                },
            }),
        );

        expect(markdown).toContain("| Phase | Marker | Sources |");
        expect(markdown).toContain("| --- | --- | --- |");
        // A pipe inside a value must not split the row.
        expect(markdown).toContain(
            "| Prophase | Chromosomes \\| condense | [S1] |",
        );
        // An unstated value stays visibly unstated rather than being invented.
        expect(markdown).toContain("| Metaphase | — | — |");
    });

    test("exports a video explainer as a readable storyboard", () => {
        const markdown = outputToMarkdown(
            output({
                type: "VIDEO_EXPLAINER",
                title: "How cells divide",
                content: {
                    version: 1,
                    storyboard: {
                        title: "How cells divide",
                        language: "en",
                        scenes: [
                            {
                                id: "s1",
                                title: "Setting up",
                                bullets: ["One cell becomes two"],
                                narration: "Every cell you have came from another.",
                                sourceLabels: ["S1"],
                            },
                            {
                                id: "s2",
                                title: "The phases",
                                bullets: ["Four stages"],
                                narration: "Division runs in four stages.",
                                sourceLabels: [],
                            },
                            {
                                id: "s3",
                                title: "Recap",
                                bullets: ["Two identical cells"],
                                narration: "You end with two identical cells.",
                                sourceLabels: [],
                            },
                        ],
                    },
                },
            }),
        );

        expect(markdown).toContain("## Storyboard");
        expect(markdown).toContain("### Scene 1: Setting up");
        expect(markdown).toContain(
            "**Narration:** Every cell you have came from another. [S1]",
        );
        expect(markdown).toContain("narration pending");
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
