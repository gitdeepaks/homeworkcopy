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

export type ConversationSummarizeEvent = {
    name: "conversation/summarize";
    data: { conversationId: string; userId: string };
};

export type SourceDeleteEvent = {
    name: "source/delete";
    data: { sourceId: string; workspaceId: string };
};

export type InngestEvents =
    | SourceCreatedEvent
    | SourceDeleteEvent
    | ArtifactGenerateEvent
    | ConversationSummarizeEvent;

// Keep this production identifier stable unless an explicit Inngest migration is run.
export const inngest = new Inngest({ id: "chaibook" });
