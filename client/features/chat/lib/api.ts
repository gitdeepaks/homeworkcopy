import { apiFetch, apiFetchVoid } from "@/shared/lib/api";
import type { ChatMessage, Conversation } from "./types";
import { citationEnvelopeSchema, citationSchema, sourceTypeSchema } from "@homeworkcopy/contracts";
import { z } from "zod";

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
    return apiFetch<Conversation[]>(
        `/api/workspaces/${workspaceId}/conversations`,
    );
}

export function createConversation(workspaceId: string, title?: string) {
    return apiFetch<Conversation>(
        `/api/workspaces/${workspaceId}/conversations`,
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
    return apiFetch<ChatMessage[]>(
        `/api/workspaces/${workspaceId}/conversations/${conversationId}/messages`,
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

export function parseCitations(value: unknown): ChatMessage["citations"] {
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
