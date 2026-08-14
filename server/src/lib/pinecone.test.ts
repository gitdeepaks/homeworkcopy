import { describe, expect, test } from "bun:test";
import { buildSourceSelectionFilter } from "./pinecone.js";

describe("Pinecone grounding filter", () => {
    test("scopes retrieval to the exact resolved source ids", () => {
        expect(buildSourceSelectionFilter(["source-2", "source-1"])).toEqual({
            sourceId: { $in: ["source-2", "source-1"] },
        });
    });
});
