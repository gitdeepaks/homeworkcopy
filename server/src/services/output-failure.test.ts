import { describe, expect, test } from "bun:test";
import {
    describeOutputFailure,
    isRetriableOutputFailure,
} from "./output-failure.js";
import {
    OutputGenerationError,
    SourceSelectionError,
} from "../types/app-error.js";

describe("output failure mapping", () => {
    test("keeps the stage and code carried by generation errors", () => {
        const error = new OutputGenerationError(
            "VALIDATION",
            "INVALID_MODEL_OUTPUT",
            "Schema rejected",
        );
        expect(describeOutputFailure(error)).toEqual({
            stage: "VALIDATION",
            code: "INVALID_MODEL_OUTPUT",
            message: "Schema rejected",
        });
    });

    test("maps an unavailable selection to the source resolution stage", () => {
        const failure = describeOutputFailure(
            new SourceSelectionError(
                "SOURCE_SELECTION_UNAVAILABLE",
                "Source was deleted",
            ),
        );
        expect(failure.stage).toBe("SOURCE_RESOLUTION");
        expect(failure.code).toBe("SOURCES_UNAVAILABLE");
    });

    test("falls back to a generic generation failure", () => {
        expect(describeOutputFailure(new Error("socket hang up"))).toEqual({
            stage: "GENERATION",
            code: "GENERATION_FAILED",
            message: "socket hang up",
        });
    });
});

describe("output retry policy", () => {
    test("retries transient provider failures", () => {
        expect(isRetriableOutputFailure(new Error("socket hang up"))).toBeTrue();
        expect(
            isRetriableOutputFailure(
                new OutputGenerationError(
                    "GENERATION",
                    "GENERATION_FAILED",
                    "provider 500",
                ),
            ),
        ).toBeTrue();
    });

    test("does not retry deterministic failures", () => {
        expect(
            isRetriableOutputFailure(
                new OutputGenerationError(
                    "VALIDATION",
                    "INVALID_MODEL_OUTPUT",
                    "still invalid",
                ),
            ),
        ).toBeFalse();
        expect(
            isRetriableOutputFailure(
                new OutputGenerationError(
                    "CONTEXT_ASSEMBLY",
                    "NO_SOURCE_CONTENT",
                    "no text",
                ),
            ),
        ).toBeFalse();
        expect(
            isRetriableOutputFailure(
                new SourceSelectionError("NO_READY_SOURCES", "none ready"),
            ),
        ).toBeFalse();
    });
});
