import { describe, expect, test } from "bun:test";
import { validateGroundingSourceCandidates } from "./grounding-source-selection.js";

describe("grounding source authorization", () => {
    test("preserves the requested custom order", () => {
        const result = validateGroundingSourceCandidates(
            { selectionMode: "custom", sourceIds: ["second", "first"] },
            [
                { id: "first", status: "READY", title: "First" },
                { id: "second", status: "READY", title: "Second" },
            ],
        );
        expect(result.map((source) => source.id)).toEqual(["second", "first"]);
    });

    test("rejects the entire set when an id is outside the notebook", () => {
        expect(() =>
            validateGroundingSourceCandidates(
                { selectionMode: "custom", sourceIds: ["owned", "foreign"] },
                [{ id: "owned", status: "READY" }],
            ),
        ).toThrow("unavailable or not ready");
    });

    test("rejects the entire set when a source is not ready", () => {
        expect(() =>
            validateGroundingSourceCandidates(
                { selectionMode: "custom", sourceIds: ["ready", "pending"] },
                [
                    { id: "ready", status: "READY" },
                    { id: "pending", status: "PROCESSING" },
                ],
            ),
        ).toThrow("unavailable or not ready");
    });

    test("all-ready excludes unavailable statuses", () => {
        const result = validateGroundingSourceCandidates(
            { selectionMode: "all-ready", sourceIds: [] },
            [
                { id: "ready", status: "READY" },
                { id: "failed", status: "FAILED" },
            ],
        );
        expect(result).toEqual([{ id: "ready", status: "READY" }]);
    });
});
