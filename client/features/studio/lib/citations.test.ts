import { describe, expect, test } from "bun:test";
import type { OutputContent, OutputSourceLabel } from "@homeworkcopy/contracts";
import { linkSourceMarkers, mapOutputProse } from "./citations";

const labels: OutputSourceLabel[] = [
    { label: "S1", sourceId: "source-1", title: "Biology chapter 2" },
    { label: "S2", sourceId: "source-2", title: 'The "cell" lecture' },
];

describe("linkSourceMarkers", () => {
    test("links a declared marker to its source", () => {
        expect(
            linkSourceMarkers("Cells divide by mitosis [S1].", labels, "nb-1"),
        ).toBe(
            'Cells divide by mitosis [S1](/workspace/nb-1/sources/source-1 "Biology chapter 2").',
        );
    });

    test("escapes quotes in the link title", () => {
        expect(linkSourceMarkers("[S2]", labels, "nb-1")).toContain(
            "\"The 'cell' lecture\"",
        );
    });

    test("removes markers that cannot be opened", () => {
        expect(
            linkSourceMarkers("Unsupported claim [S9].", labels, "nb-1"),
        ).toBe("Unsupported claim .");
        expect(linkSourceMarkers("No labels [S1].", [], "nb-1")).toBe(
            "No labels .",
        );
    });

    test("leaves ordinary text untouched", () => {
        expect(linkSourceMarkers("See [the docs](x).", labels, "nb-1")).toBe(
            "See [the docs](x).",
        );
    });
});

describe("mapOutputProse", () => {
    test("transforms every prose field of a briefing", () => {
        const result = mapOutputProse(
            {
                type: "BRIEFING",
                data: {
                    headline: "Q3 review",
                    summary: "a",
                    keyPoints: ["b", "c", "d"],
                    decisions: ["e"],
                    risks: [],
                    nextSteps: ["f"],
                },
            },
            (text) => `${text}!`,
        );

        expect(result.type).toBe("BRIEFING");
        if (result.type === "BRIEFING") {
            expect(result.data.headline).toBe("Q3 review");
            expect(result.data.summary).toBe("a!");
            expect(result.data.keyPoints).toEqual(["b!", "c!", "d!"]);
            expect(result.data.risks).toEqual([]);
        }
    });

    test("leaves card, quiz, and graph content alone", () => {
        const quiz: OutputContent = {
            type: "QUIZ",
            data: {
                questions: [
                    {
                        question: "q",
                        options: ["a", "b"],
                        correctIndex: 0,
                        explanation: "e",
                    },
                ],
            },
        };

        expect(mapOutputProse(quiz, (text) => `${text}!`)).toBe(quiz);
    });
});
