/**
 * Schema-validated JSON generation shared by every Studio output pipeline.
 *
 * Lives in `lib` rather than beside one pipeline so the text, audio, video, and
 * structured generators can all depend on it without depending on each other.
 */

import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type { z } from "zod";
import {
    OUTPUT_MAX_GENERATION_ATTEMPTS,
    type OutputFailureStage,
    type OutputType,
} from "@homeworkcopy/contracts";
import { CHAT_MODEL } from "./ai-config.js";
import { logger } from "./logger.js";
import { withTimeout } from "./timeout.js";
import { OutputGenerationError } from "../types/app-error.js";

/** Upper bound for a single structured generation call. */
export const OUTPUT_GENERATION_TIMEOUT_MS = 120_000;

/** Provider used for every Studio output today. */
export const OUTPUT_PROVIDER = "openai";

function describeIssues(error: z.ZodError): string {
    return error.issues
        .slice(0, 5)
        .map((issue) => {
            const path = issue.path.join(".");
            return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join("; ");
}

/**
 * Generates schema-valid JSON, re-prompting the model with the validation
 * failure before giving up.
 *
 * @param type - Output type being generated (used for logs only)
 * @param schema - Contract schema the response must satisfy
 * @param system - System prompt describing the task
 * @param prompt - User prompt carrying the source material
 * @param failureStage - Pipeline stage reported when every attempt fails
 * @returns Validated data plus the number of repair round-trips that were needed
 * @throws {OutputGenerationError} When no attempt produced schema-valid output
 */
export async function generateStructured<T>(
    type: OutputType,
    schema: z.ZodType<T>,
    system: string,
    prompt: string,
    failureStage: OutputFailureStage = "VALIDATION",
): Promise<{ data: T; repairAttempts: number }> {
    let lastFailure = "";

    for (
        let repairAttempts = 0;
        repairAttempts < OUTPUT_MAX_GENERATION_ATTEMPTS;
        repairAttempts += 1
    ) {
        const attemptPrompt = lastFailure
            ? [
                  prompt,
                  "",
                  `Your previous response was rejected because it did not satisfy the schema: ${lastFailure}`,
                  "Return corrected JSON that satisfies the schema exactly.",
              ].join("\n")
            : prompt;

        try {
            const result = await withTimeout(
                "Output generation",
                OUTPUT_GENERATION_TIMEOUT_MS,
                generateText({
                    model: openai(CHAT_MODEL),
                    system,
                    output: Output.object({ schema }),
                    prompt: attemptPrompt,
                }),
            );

            const validated = schema.safeParse(result.output);
            if (validated.success) {
                return { data: validated.data, repairAttempts };
            }

            lastFailure = describeIssues(validated.error);
            logger.warn(
                { outputType: type, repairAttempts },
                "Studio output failed schema validation",
            );
        } catch (error) {
            lastFailure =
                error instanceof Error
                    ? error.message
                    : "Output generation failed";
            logger.warn(
                { outputType: type, repairAttempts },
                "Studio output generation attempt failed",
            );
        }
    }

    throw new OutputGenerationError(
        failureStage,
        "INVALID_MODEL_OUTPUT",
        `The model did not return valid ${type.toLowerCase().replace(/_/g, " ")} data after ${OUTPUT_MAX_GENERATION_ATTEMPTS} attempts.`,
    );
}
