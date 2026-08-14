import { describe, expect, test } from "bun:test";
import { resolveSourceSelection } from "./grounding";
import type { Source } from "./types";

function source(id: string, status: Source["status"]): Source {
    return {
        id,
        workspaceId: "notebook-1",
        type: "TEXT",
        title: id,
        content: null,
        url: null,
        status,
        metadata: null,
        createdAt: "2026-08-14T00:00:00.000Z",
        updatedAt: "2026-08-14T00:00:00.000Z",
    };
}

describe("client source selection", () => {
    const sources = [
        source("ready-1", "READY"),
        source("ready-2", "READY"),
        source("processing", "PROCESSING"),
        source("failed", "FAILED"),
    ];

    test("all-ready dynamically includes only ready sources", () => {
        const result = resolveSourceSelection(sources, "all-ready", []);
        expect(result.effectiveSourceIds).toEqual(["ready-1", "ready-2"]);
        expect(result.request).toEqual({
            selectionMode: "all-ready",
            sourceIds: ["ready-1", "ready-2"],
        });
        expect(result.canUseSelection).toBeTrue();
    });

    test("custom mode exposes deleted and non-ready selections", () => {
        const result = resolveSourceSelection(sources, "custom", [
            "ready-2",
            "processing",
            "deleted",
        ]);
        expect(result.effectiveSourceIds).toEqual(["ready-2"]);
        expect(result.unavailableSourceIds).toEqual(["processing", "deleted"]);
        expect(result.canUseSelection).toBeFalse();
    });

    test("custom mode requires at least one source", () => {
        expect(resolveSourceSelection(sources, "custom", []).canUseSelection).toBeFalse();
    });
});
