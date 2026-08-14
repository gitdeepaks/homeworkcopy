import { describe, expect, test } from "bun:test";
import {
    groundingRequestSchema,
    groundingSnapshotSchema,
    SOURCE_SELECTION_MAX,
    type GroundingSnapshot,
} from "./index";

describe("grounding contracts", () => {
    test("accepts explicit all-ready and custom requests", () => {
        expect(
            groundingRequestSchema.parse({
                selectionMode: "all-ready",
                sourceIds: ["source-1"],
                groundingMode: "notebook",
            }),
        ).toEqual({
            selectionMode: "all-ready",
            sourceIds: ["source-1"],
            groundingMode: "notebook",
        });
        expect(
            groundingRequestSchema.parse({
                selectionMode: "custom",
                sourceIds: ["source-2"],
                groundingMode: "notebook-web",
            }),
        ).toBeTruthy();
    });

    test("rejects empty custom, duplicate, and oversized selections", () => {
        expect(
            groundingRequestSchema.safeParse({
                selectionMode: "custom",
                sourceIds: [],
                groundingMode: "notebook",
            }).success,
        ).toBeFalse();
        expect(
            groundingRequestSchema.safeParse({
                selectionMode: "custom",
                sourceIds: ["same", "same"],
                groundingMode: "notebook",
            }).success,
        ).toBeFalse();
        expect(
            groundingRequestSchema.safeParse({
                selectionMode: "all-ready",
                sourceIds: Array.from(
                    { length: SOURCE_SELECTION_MAX + 1 },
                    (_, index) => `source-${index}`,
                ),
                groundingMode: "notebook",
            }).success,
        ).toBeFalse();
    });

    test("round trips a versioned resolved snapshot", () => {
        const snapshot: GroundingSnapshot = {
            version: 1,
            selectionMode: "custom",
            groundingMode: "notebook-general",
            sourceIds: ["source-1", "source-2"],
            retrievalVersion: "hybrid-v1",
        };
        expect(groundingSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    });
});
