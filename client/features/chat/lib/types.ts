import type {
    Citation,
    GroundingSnapshot,
    MessageFeedback,
} from "@homeworkcopy/contracts";

export type ChatCitation = Citation;

export type Conversation = {
    id: string;
    workspaceId: string;
    title: string | null;
    createdAt: string;
    updatedAt: string;
};

export type ChatMessage = {
    id: string;
    conversationId: string;
    role: "USER" | "ASSISTANT";
    content: string;
    citations: ChatCitation[] | null;
    grounding: GroundingSnapshot | null;
    clientMessageId: string | null;
    retryOfId: string | null;
    supersededAt: string | null;
    feedback: MessageFeedback | null;
    createdAt: string;
};
