import { Inngest } from "inngest";

export type SourceCreatedEvent = {
    name: "source/created";
    data: {
        sourceId: string;
        workspaceId: string;
    };
};

export type ArtifactGenerateEvent = {
    name: "artifact/generate";
    data: { artifactId: string; workspaceId: string };
};

export type ConversationSummarizeEvent = {
    name: "conversation/summarize";
    data: { conversationId: string; userId: string };
};

export type InngestEvents =
    | SourceCreatedEvent
    | ArtifactGenerateEvent
    | ConversationSummarizeEvent;

// Keep this production identifier stable unless an explicit Inngest migration is run.
export const inngest = new Inngest({ id: "chaibook" });
