/**
 * Inngest event helpers for background source processing (RAG indexing).
 */

import { sendInngestEvent } from "../inngest/client.js";

/**
 * Enqueues a source processing job to run asynchronously via Inngest.
 *
 * The worker runs extract → chunk → embed → Pinecone upsert.
 *
 * @param input - Source and workspace ids for the processing worker
 * @returns Resolves when the event is accepted by Inngest
 *
 */
export async function enqueueSourceProcessing(input: {
    sourceId: string;
    workspaceId: string;
    processingVersion: number;
}) {
    await sendInngestEvent({
        id: `source-process:${input.sourceId}:v${input.processingVersion}`,
        name: "source/created",
        data: input,
    });
}

export async function enqueueSourceDeletion(input: {
    sourceId: string;
    workspaceId: string;
}) {
    await sendInngestEvent({
        name: "source/delete",
        data: input,
    });
}
