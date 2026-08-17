import { describe, expect, test } from "bun:test";
import {
    dataTableOutputContentSchema,
    editOutputContentRequestSchema,
    isEditableOutputType,
    OUTPUT_TYPE_GROUP,
    parseOutputContent,
    slidesOutputContentSchema,
} from "./index";

function slide(id: string) {
    return {
        id,
        title: `Slide ${id}`,
        bullets: ["A talking point"],
        sourceLabels: ["S1"],
    };
}

const deck = {
    title: "Cell division",
    slides: [slide("sl1"), slide("sl2"), slide("sl3")],
};

const table = {
    id: "t1",
    title: "Phases",
    columns: [
        { label: "Phase", kind: "text" as const },
        { label: "Duration", kind: "text" as const },
    ],
    rows: [
        { id: "r1", cells: ["Prophase", "1 hour"], sourceLabels: ["S1"] },
        { id: "r2", cells: ["Metaphase", ""], sourceLabels: [] },
    ],
};

describe("output type registry", () => {
    test("puts the new types on the intended Studio shelves", () => {
        expect(OUTPUT_TYPE_GROUP.SLIDES).toBe("writing");
        expect(OUTPUT_TYPE_GROUP.DATA_TABLE).toBe("writing");
        expect(OUTPUT_TYPE_GROUP.VIDEO_EXPLAINER).toBe("featured-media");
    });

    test("only structured deliverables are editable by hand", () => {
        expect(isEditableOutputType("SLIDES")).toBe(true);
        expect(isEditableOutputType("DATA_TABLE")).toBe(true);
        expect(isEditableOutputType("VIDEO_EXPLAINER")).toBe(false);
        expect(isEditableOutputType("SUMMARY")).toBe(false);
    });
});

describe("slidesOutputContentSchema", () => {
    test("accepts a deck with contiguous ids", () => {
        expect(
            slidesOutputContentSchema.safeParse({ version: 1, deck }).success,
        ).toBe(true);
    });

    test("rejects duplicate slide ids", () => {
        const parsed = slidesOutputContentSchema.safeParse({
            version: 1,
            deck: { ...deck, slides: [slide("sl1"), slide("sl1"), slide("sl2")] },
        });
        expect(parsed.success).toBe(false);
    });

    test("rejects a deck below the minimum length", () => {
        const parsed = slidesOutputContentSchema.safeParse({
            version: 1,
            deck: { ...deck, slides: [slide("sl1")] },
        });
        expect(parsed.success).toBe(false);
    });

    test("rejects duplicate source labels on one slide", () => {
        const parsed = slidesOutputContentSchema.safeParse({
            version: 1,
            deck: {
                ...deck,
                slides: [
                    { ...slide("sl1"), sourceLabels: ["S1", "S1"] },
                    slide("sl2"),
                    slide("sl3"),
                ],
            },
        });
        expect(parsed.success).toBe(false);
    });
});

describe("dataTableOutputContentSchema", () => {
    test("accepts empty cells for values the sources do not state", () => {
        expect(
            dataTableOutputContentSchema.safeParse({ version: 1, tables: [table] })
                .success,
        ).toBe(true);
    });

    test("rejects a row whose cell count does not match the columns", () => {
        const parsed = dataTableOutputContentSchema.safeParse({
            version: 1,
            tables: [
                {
                    ...table,
                    rows: [{ id: "r1", cells: ["Prophase"], sourceLabels: [] }],
                },
            ],
        });
        expect(parsed.success).toBe(false);
    });

    test("rejects duplicate row ids", () => {
        const parsed = dataTableOutputContentSchema.safeParse({
            version: 1,
            tables: [
                {
                    ...table,
                    rows: [table.rows[0], table.rows[0]],
                },
            ],
        });
        expect(parsed.success).toBe(false);
    });
});

describe("parseOutputContent", () => {
    test("tags slide content with its type", () => {
        const parsed = parseOutputContent("SLIDES", { version: 1, deck });
        expect(parsed?.type).toBe("SLIDES");
    });

    test("rejects content generated for a different type", () => {
        expect(parseOutputContent("DATA_TABLE", { version: 1, deck })).toBeNull();
    });

    test("reads a storyboard that has no narration yet", () => {
        const parsed = parseOutputContent("VIDEO_EXPLAINER", {
            version: 1,
            storyboard: {
                title: "Heat",
                language: "en",
                scenes: [
                    {
                        id: "s1",
                        title: "Intro",
                        bullets: ["Point"],
                        narration: "Spoken.",
                        sourceLabels: ["S1"],
                    },
                    {
                        id: "s2",
                        title: "Body",
                        bullets: ["Point"],
                        narration: "Spoken.",
                        sourceLabels: [],
                    },
                    {
                        id: "s3",
                        title: "End",
                        bullets: ["Point"],
                        narration: "Spoken.",
                        sourceLabels: [],
                    },
                ],
            },
        });
        expect(parsed?.type).toBe("VIDEO_EXPLAINER");
    });
});

describe("editOutputContentRequestSchema", () => {
    test("accepts a slide edit", () => {
        const parsed = editOutputContentRequestSchema.safeParse({
            type: "SLIDES",
            deck,
        });
        expect(parsed.success).toBe(true);
    });

    test("accepts a table edit", () => {
        const parsed = editOutputContentRequestSchema.safeParse({
            type: "DATA_TABLE",
            tables: [table],
        });
        expect(parsed.success).toBe(true);
    });

    test("rejects an edit for a type with no editable shape", () => {
        const parsed = editOutputContentRequestSchema.safeParse({
            type: "SUMMARY",
            markdown: "Rewritten",
        });
        expect(parsed.success).toBe(false);
    });

    test("rejects a slide edit that would break the viewer", () => {
        const parsed = editOutputContentRequestSchema.safeParse({
            type: "SLIDES",
            deck: {
                ...deck,
                slides: [{ ...slide("sl1"), bullets: [] }, slide("sl2"), slide("sl3")],
            },
        });
        expect(parsed.success).toBe(false);
    });
});
