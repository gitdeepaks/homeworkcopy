import { describe, expect, test } from "bun:test";
import type {
    OutputGenerationOptions,
    OutputSourceLabel,
} from "@homeworkcopy/contracts";
import { OutputGenerationError } from "../types/app-error.js";
import {
    buildDataTableSystemPrompt,
    buildSlidesSystemPrompt,
    dataTableResponseSchemaFor,
    normalizeDataTables,
    normalizeSlideDeck,
    slidesResponseSchemaFor,
} from "./structured-output.service.js";

const options: OutputGenerationOptions = {
    version: 1,
    length: "standard",
    locale: "en",
};

const sourceLabels: OutputSourceLabel[] = [
    { label: "S1", sourceId: "src-1", title: "Lecture notes" },
    { label: "S2", sourceId: "src-2", title: "Textbook chapter" },
];

function rawSlide(title: string, sourceLabels: string[] = ["S1"]) {
    return { title, bullets: ["A point"], sourceLabels };
}

describe("normalizeSlideDeck", () => {
    test("assigns contiguous ids rather than trusting the model", () => {
        const content = normalizeSlideDeck({
            title: "Photosynthesis",
            slides: [rawSlide("Intro"), rawSlide("Body"), rawSlide("Recap")],
        });

        expect(content.deck.slides.map((slide) => slide.id)).toEqual([
            "sl1",
            "sl2",
            "sl3",
        ]);
        expect(content.version).toBe(1);
    });

    test("drops duplicate labels on a slide", () => {
        const content = normalizeSlideDeck({
            title: "Photosynthesis",
            slides: [
                rawSlide("Intro", ["S1", "S1", "S2"]),
                rawSlide("Body"),
                rawSlide("Recap"),
            ],
        });

        expect(content.deck.slides[0]?.sourceLabels).toEqual(["S1", "S2"]);
    });

    test("omits speaker notes rather than storing an empty string", () => {
        const content = normalizeSlideDeck({
            title: "Photosynthesis",
            slides: [
                { ...rawSlide("Intro"), speakerNotes: "" },
                rawSlide("Body"),
                rawSlide("Recap"),
            ],
        });

        expect(content.deck.slides[0]?.speakerNotes).toBeUndefined();
    });

    test("rejects a deck the viewers could not render", () => {
        expect(() =>
            normalizeSlideDeck({
                title: "Too short",
                slides: [rawSlide("Only one")],
            }),
        ).toThrow(OutputGenerationError);
    });
});

describe("slidesResponseSchemaFor", () => {
    test("rejects a marker outside this generation's labels", () => {
        const schema = slidesResponseSchemaFor(sourceLabels, "short");
        const parsed = schema.safeParse({
            title: "Deck",
            slides: [
                rawSlide("One", ["S9"]),
                rawSlide("Two"),
                rawSlide("Three"),
                rawSlide("Four"),
            ],
        });

        expect(parsed.success).toBe(false);
    });

    test("binds the deck size to the requested depth", () => {
        const schema = slidesResponseSchemaFor(sourceLabels, "short");
        const parsed = schema.safeParse({
            title: "Deck",
            slides: Array.from({ length: 12 }, (_, index) =>
                rawSlide(`Slide ${index}`),
            ),
        });

        expect(parsed.success).toBe(false);
    });
});

describe("buildSlidesSystemPrompt", () => {
    test("names every allowed label and refuses invented ones", () => {
        const prompt = buildSlidesSystemPrompt(options, sourceLabels);

        expect(prompt).toContain("S1 = Lecture notes");
        expect(prompt).toContain("S2 = Textbook chapter");
        expect(prompt).toContain("Never use a label outside this list");
    });

    test("passes the reader's focus through", () => {
        const prompt = buildSlidesSystemPrompt(
            { ...options, focus: "the light-dependent reactions" },
            sourceLabels,
        );
        expect(prompt).toContain("the light-dependent reactions");
    });
});

describe("normalizeDataTables", () => {
    test("assigns table and row ids", () => {
        const content = normalizeDataTables([
            {
                title: "Comparison",
                columns: [
                    { label: "Name", kind: "text" },
                    { label: "Year", kind: "date" },
                ],
                rows: [
                    { cells: ["Alpha", "1994"], sourceLabels: ["S1"] },
                    { cells: ["Beta", ""], sourceLabels: [] },
                ],
            },
        ]);

        expect(content.tables[0]?.id).toBe("t1");
        expect(content.tables[0]?.rows.map((row) => row.id)).toEqual([
            "r1",
            "r2",
        ]);
    });

    test("rejects a ragged table", () => {
        expect(() =>
            normalizeDataTables([
                {
                    title: "Ragged",
                    columns: [
                        { label: "Name", kind: "text" },
                        { label: "Year", kind: "date" },
                    ],
                    rows: [{ cells: ["Alpha"], sourceLabels: [] }],
                },
            ]),
        ).toThrow(OutputGenerationError);
    });
});

describe("dataTableResponseSchemaFor", () => {
    test("rejects a row with the wrong number of cells", () => {
        const schema = dataTableResponseSchemaFor(sourceLabels, "standard");
        const parsed = schema.safeParse({
            tables: [
                {
                    title: "Ragged",
                    columns: [
                        { label: "Name", kind: "text" },
                        { label: "Year", kind: "date" },
                    ],
                    rows: [
                        { cells: ["Alpha", "1994"], sourceLabels: ["S1"] },
                        { cells: ["Beta", "1995", "extra"], sourceLabels: [] },
                    ],
                },
            ],
        });

        expect(parsed.success).toBe(false);
    });

    test("caps the number of tables at the requested depth", () => {
        const schema = dataTableResponseSchemaFor(sourceLabels, "short");
        const table = {
            title: "One",
            columns: [
                { label: "Name", kind: "text" as const },
                { label: "Year", kind: "date" as const },
            ],
            rows: [{ cells: ["Alpha", "1994"], sourceLabels: ["S1"] }],
        };

        expect(schema.safeParse({ tables: [table] }).success).toBe(true);
        expect(schema.safeParse({ tables: [table, table] }).success).toBe(false);
    });
});

describe("buildDataTableSystemPrompt", () => {
    test("forbids inventing or reformatting values", () => {
        const prompt = buildDataTableSystemPrompt(options, sourceLabels);

        expect(prompt).toContain("Never invent a value");
        expect(prompt).toContain("Leave a cell as an empty string");
    });
});
