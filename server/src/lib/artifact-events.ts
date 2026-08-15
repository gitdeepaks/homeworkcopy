/**
 * Inngest event helpers for background Studio output generation.
 */

import { inngest } from "../inngest/client.js";

/**
 * Enqueues an output generation job to run asynchronously via Inngest.
 *
 * The attempt number lets the worker detect that it was superseded by a
 * cancellation or a newer regeneration before it writes any result.
 *
 * @param input - Output, notebook, and attempt number for the worker
 * @returns Resolves when the event is accepted by Inngest
 */
export async function enqueueArtifactGeneration(input: {
    artifactId: string;
    workspaceId: string;
    attempt: number;
}) {
    await inngest.send({
        name: "artifact/generate",
        data: input,
    });
}
