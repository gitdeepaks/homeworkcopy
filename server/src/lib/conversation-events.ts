/**
 * Inngest event helpers for background conversation summarization.
 */

import { sendInngestEvent } from "../inngest/client.js";

/**
 * Enqueues a conversation summary job to run asynchronously via Inngest.
 *
 * Triggered every {@link CONVERSATION_SUMMARY_INTERVAL} messages during chat.
 *
 * @param input - Conversation and user ids for the summary worker
 * @returns Resolves when the event is accepted by Inngest
 *
 */
export async function enqueueConversationSummarize(input: {
    conversationId: string;
    userId: string;
}) {
    await sendInngestEvent({
        name: "conversation/summarize",
        data: input,
    });
}
