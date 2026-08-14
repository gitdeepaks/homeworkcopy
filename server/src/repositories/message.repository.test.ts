import { describe, expect, test } from "bun:test";
import type { SourceCitation } from "@homeworkcopy/contracts";
import { ValidationError } from "../types/app-error.js";
import { validateCitationTargets } from "./message.repository.js";

const citation: SourceCitation = {
    kind: "source",
    label: "1",
    sourceId: "source-1",
    sourceType: "PDF",
    title: "Paper",
    excerpt: "Evidence",
    chunkId: "chunk-1",
    chunkIndex: 3,
    page: 2,
    provenance: { provider: "hybrid" },
};

describe("validateCitationTargets", () => {
    test("accepts a matching source and exact chunk", () => {
        expect(() =>
            validateCitationTargets(
                [citation],
                [{ id: "source-1" }],
                [{ id: "chunk-1", sourceId: "source-1", index: 3 }],
            ),
        ).not.toThrow();
    });

    test("rejects a chunk belonging to another source", () => {
        expect(() =>
            validateCitationTargets(
                [citation],
                [{ id: "source-1" }],
                [{ id: "chunk-1", sourceId: "source-2", index: 3 }],
            ),
        ).toThrow(ValidationError);
    });

    test("rejects citations without an exact chunk", () => {
        const pageOnly: SourceCitation = {
            kind: "source",
            label: "1",
            sourceId: "source-1",
            sourceType: "PDF",
            title: "Paper",
            excerpt: "Evidence",
            page: 2,
            provenance: { provider: "hybrid" },
        };

        expect(() =>
            validateCitationTargets([pageOnly], [{ id: "source-1" }], []),
        ).toThrow(ValidationError);
    });
});
