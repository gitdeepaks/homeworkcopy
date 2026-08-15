"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    createConversation,
    deleteConversation,
    listConversationMessages,
    listConversations,
    renameConversation,
    setMessageFeedback,
    saveMessageAsOutput,
    getChatGuide,
} from "../lib/api";
import type { MessageFeedback, SourceSelection } from "@homeworkcopy/contracts";
import { outputKeys } from "@/features/studio/hooks/use-outputs";

export function chatKeys(workspaceId: string) {
    return {
        all: ["chat", workspaceId] as const,
        conversations: () => ["chat", workspaceId, "conversations"] as const,
        messages: (conversationId: string) =>
            ["chat", workspaceId, "messages", conversationId] as const,
    };
}

export function useConversations(workspaceId: string) {
    return useQuery({
        queryKey: chatKeys(workspaceId).conversations(),
        queryFn: () => listConversations(workspaceId),
    });
}

export function useConversationMessages(
    workspaceId: string,
    conversationId: string | null,
) {
    return useQuery({
        queryKey: chatKeys(workspaceId).messages(conversationId ?? "none"),
        queryFn: () =>
            conversationId
                ? listConversationMessages(workspaceId, conversationId)
                : Promise.resolve([]),
        enabled: Boolean(conversationId),
    });
}

export function useCreateConversation(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (title?: string) =>
            createConversation(workspaceId, title),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: chatKeys(workspaceId).conversations(),
            });
        },
    });
}

export function useDeleteConversation(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (conversationId: string) =>
            deleteConversation(workspaceId, conversationId),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: chatKeys(workspaceId).all,
            });
        },
    });
}

export function useRenameConversation(workspaceId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: { conversationId: string; title: string }) =>
            renameConversation(workspaceId, input.conversationId, input.title),
        onSuccess: () =>
            queryClient.invalidateQueries({
                queryKey: chatKeys(workspaceId).conversations(),
            }),
    });
}

export function useMessageFeedback(workspaceId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (input: {
            conversationId: string;
            messageId: string;
            feedback: MessageFeedback;
        }) =>
            setMessageFeedback(
                workspaceId,
                input.conversationId,
                input.messageId,
                input.feedback,
            ),
        onSuccess: (_, input) =>
            queryClient.invalidateQueries({
                queryKey: chatKeys(workspaceId).messages(input.conversationId),
            }),
    });
}

export function useSaveMessageAsOutput(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: { conversationId: string; messageId: string }) =>
            saveMessageAsOutput(
                workspaceId,
                input.conversationId,
                input.messageId,
            ),
        // The saved answer appears immediately on the Studio shelf.
        onSuccess: () =>
            queryClient.invalidateQueries({
                queryKey: outputKeys(workspaceId).all,
            }),
    });
}

export function useChatGuide(
    workspaceId: string,
    selection: SourceSelection,
    enabled: boolean,
) {
    return useQuery({
        queryKey: ["chat", workspaceId, "guide", selection] as const,
        queryFn: () => getChatGuide(workspaceId, selection),
        enabled,
        staleTime: 5 * 60 * 1_000,
    });
}

export function buildCitationMap(messages: Awaited<ReturnType<typeof listConversationMessages>>) {
    const map: Record<string, NonNullable<(typeof messages)[number]["citations"]>> = {};

    for (const message of messages) {
        if (message.role === "ASSISTANT") {
            const citations = message.citations;
            if (citations?.length) {
                map[message.id] = citations;
            }
        }
    }

    return map;
}
