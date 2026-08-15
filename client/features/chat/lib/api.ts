import { apiFetchVoid, apiFetchWithSchema } from "@/shared/lib/api";
import type { ChatMessage } from "./types";
import {
    citationEnvelopeSchema,
    citationSchema,
    groundingSnapshotSchema,
    sourceTypeSchema,
    chatGuideSchema,
    type MessageFeedback,
    type SourceSelection,
} from "@homeworkcopy/contracts";
import { z } from "zod";

const conversationSchema = z.object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    title: z.string().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
});

const chatMessageWireSchema = z.object({
    id: z.string().min(1),
    conversationId: z.string().min(1),
    role: z.enum(["USER", "ASSISTANT"]),
    content: z.string(),
    citations: z.json(),
    grounding: z.json(),
    clientMessageId: z.string().nullable(),
    retryOfId: z.string().nullable(),
    supersededAt: z.iso.datetime().nullable(),
    feedback: z.enum(["HELPFUL", "NOT_HELPFUL"]).nullable(),
    createdAt: z.iso.datetime(),
});

const legacyCitationSchema = z.object({
    sourceId: z.string().min(1).optional(),
    sourceTitle: z.string().min(1),
    sourceType: z.string().min(1),
    chunkId: z.string().min(1).optional(),
    chunkIndex: z.number().int().nonnegative().optional(),
    page: z.number().int().positive().optional(),
    excerpt: z.string().default(""),
    score: z.number().finite().optional(),
    url: z.url({ protocol: /^https?$/ }).optional(),
});

export function listConversations(workspaceId: string) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/conversations`,
        z.array(conversationSchema),
    );
}

export function createConversation(workspaceId: string, title?: string) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/conversations`,
        conversationSchema,
        {
            method: "POST",
            body: JSON.stringify(title ? { title } : {}),
        },
    );
}

export function listConversationMessages(
    workspaceId: string,
    conversationId: string,
) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}/messages`,
        z.array(chatMessageWireSchema),
    ).then((messages) =>
        messages.map((message) => ({
            ...message,
            id: message.clientMessageId ?? message.id,
            citations: parseCitations(message.citations),
            grounding: parseGrounding(message.grounding),
        })),
    );
}

export function renameConversation(
    workspaceId: string,
    conversationId: string,
    title: string,
) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}`,
        conversationSchema,
        { method: "PATCH", body: JSON.stringify({ title }) },
    );
}

export function setMessageFeedback(
    workspaceId: string,
    conversationId: string,
    messageId: string,
    feedback: MessageFeedback,
) {
    return apiFetchVoid(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}/messages/${messageId}/feedback`,
        { method: "PUT", body: JSON.stringify({ feedback }) },
    );
}

export function saveMessageAsOutput(
    workspaceId: string,
    conversationId: string,
    messageId: string,
) {
    return apiFetchVoid(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}/messages/${messageId}/output`,
        { method: "POST" },
    );
}

export function getChatGuide(workspaceId: string, selection: SourceSelection) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/chat/guide`,
        chatGuideSchema,
        { method: "POST", body: JSON.stringify(selection) },
    );
}

export function deleteConversation(
    workspaceId: string,
    conversationId: string,
) {
    return apiFetchVoid(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}`,
        { method: "DELETE" },
    );
}

type JsonValue = z.infer<typeof z.json>;
export function parseCitations(value: JsonValue): ChatMessage["citations"] {
    const envelope = citationEnvelopeSchema.safeParse(value);
    if (envelope.success) return envelope.data.items;

    const legacy = z.array(legacyCitationSchema).safeParse(value);
    if (!legacy.success) return null;

    return legacy.data.flatMap((item, index) => {
        if (item.sourceType === "WEB" && item.url) {
            const citation = citationSchema.safeParse({
                kind: "web",
                label: `W${index + 1}`,
                title: item.sourceTitle,
                url: item.url,
                excerpt: item.excerpt,
                provenance: { provider: "tavily", query: "legacy conversation" },
            });
            return citation.success ? [citation.data] : [];
        }

        const sourceType = sourceTypeSchema.safeParse(item.sourceType);
        if (!item.sourceId || !sourceType.success) return [];
        const citation = citationSchema.safeParse({
            kind: "source",
            label: String(index + 1),
            sourceId: item.sourceId,
            sourceType: sourceType.data,
            title: item.sourceTitle,
            excerpt: item.excerpt,
            chunkId: item.chunkId,
            chunkIndex: item.chunkIndex,
            page: item.page,
            provenance: { provider: "pinecone", score: item.score },
        });
        return citation.success ? [citation.data] : [];
    });
}

export function parseGrounding(value: JsonValue): ChatMessage["grounding"] {
    const grounding = groundingSnapshotSchema.safeParse(value);
    return grounding.success ? grounding.data : null;
}
