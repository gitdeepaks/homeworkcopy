/**
 * Job handoffs for the two privacy operations that cannot run inside a request.
 *
 * Both are slow enough to time out a request and important enough that "the tab
 * was closed" must not be able to abandon them halfway. Queuing is idempotent by
 * event id, so a reader who double-submits gets one archive and one deletion.
 */

import { sendInngestEvent } from "../inngest/client.js";

/**
 * Enqueues building an export archive.
 *
 * @param input - Export row and its owner
 * @returns Resolves when the event is accepted by Inngest
 */
export async function enqueueDataExport(input: {
    exportId: string;
    userId: string;
}) {
    await sendInngestEvent({
        id: `privacy-export:${input.exportId}`,
        name: "privacy/export-requested",
        data: input,
    });
}

/**
 * Enqueues an account deletion.
 *
 * The event id is derived from the account, so submitting the form twice queues
 * one deletion rather than two racing walks over the same stores.
 *
 * @param input - Account to delete
 * @returns Resolves when the event is accepted by Inngest
 */
export async function enqueueAccountDeletion(input: { userId: string }) {
    await sendInngestEvent({
        id: `privacy-account-deletion:${input.userId}`,
        name: "privacy/account-deletion-requested",
        data: input,
    });
}
