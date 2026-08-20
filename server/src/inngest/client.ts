import { Inngest } from "inngest";

export type SourceCreatedEvent = {
    name: "source/created";
    data: {
        sourceId: string;
        workspaceId: string;
        processingVersion?: number;
    };
};

export type ArtifactGenerateEvent = {
    name: "artifact/generate";
    data: { artifactId: string; workspaceId: string; attempt?: number };
};

/** Retires a stored media object an output no longer owns. */
export type ArtifactMediaCleanupEvent = {
    name: "artifact/media-cleanup";
    data: { workspaceId: string; publicId: string };
};

export type ConversationSummarizeEvent = {
    name: "conversation/summarize";
    data: { conversationId: string; userId: string };
};

export type SourceDeleteEvent = {
    name: "source/delete";
    data: { sourceId: string; workspaceId: string };
};

/** Builds an archive a reader asked for. */
export type DataExportRequestedEvent = {
    name: "privacy/export-requested";
    data: { exportId: string; userId: string };
};

/**
 * Carries out an account deletion.
 *
 * Carries the user id because by the time this finishes there is no account to
 * look one up from.
 */
export type AccountDeletionRequestedEvent = {
    name: "privacy/account-deletion-requested";
    data: { userId: string };
};

export type InngestEvents =
    | SourceCreatedEvent
    | SourceDeleteEvent
    | ArtifactGenerateEvent
    | ArtifactMediaCleanupEvent
    | ConversationSummarizeEvent
    | DataExportRequestedEvent
    | AccountDeletionRequestedEvent;

// Keep this production identifier stable unless an explicit Inngest migration is run.
export const inngest = new Inngest({ id: "chaibook" });

/**
 * Queues a job, checked against {@link InngestEvents}.
 *
 * `inngest.send` accepts any name with any payload, so a renamed field or a
 * missing id becomes a job that fails in production some seconds after the
 * request that queued it already returned success. This narrows the argument to
 * the declared union, which turns that class of mistake into a compile error and
 * gives the union a job beyond documentation.
 *
 * @param event - One of the declared events, with its exact payload. An
 * optional `id` makes delivery idempotent, which is how a retried request
 * queues the same work once rather than twice.
 * @returns Resolves once the event is accepted for delivery
 */
export async function sendInngestEvent(
    event: InngestEvents & { id?: string },
): Promise<void> {
    await inngest.send(event);
}
