import type { OutputMetadata } from "@homeworkcopy/contracts";
import {
    OutputGenerationError,
    SourceSelectionError,
} from "../types/app-error.js";

export type OutputFailure = NonNullable<OutputMetadata["failure"]>;

/**
 * Maps a thrown error onto the failure stage/code persisted on an output.
 *
 * @param error - Error raised anywhere in the generation pipeline
 * @returns Stage, stable code, and a safe message for the reader
 */
export function describeOutputFailure(error: Error): OutputFailure {
    if (error instanceof OutputGenerationError) {
        return {
            stage: error.stage,
            code: error.failureCode,
            message: error.message,
        };
    }

    if (error instanceof SourceSelectionError) {
        return {
            stage: "SOURCE_RESOLUTION",
            code: "SOURCES_UNAVAILABLE",
            message: error.message,
        };
    }

    return {
        stage: "GENERATION",
        code: "GENERATION_FAILED",
        message: error.message,
    };
}

/**
 * Whether the background worker should rethrow so Inngest retries the job.
 *
 * Deterministic failures (unavailable sources, invalid model output) stay
 * failed so a retry cannot burn provider budget on the same outcome.
 *
 * @param error - Error raised anywhere in the generation pipeline
 * @returns `true` when a retry could plausibly succeed
 */
export function isRetriableOutputFailure(error: Error): boolean {
    if (error instanceof OutputGenerationError) {
        return error.isRetriable;
    }
    return !(error instanceof SourceSelectionError);
}
