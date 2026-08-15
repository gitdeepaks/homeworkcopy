"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ApiError, authenticatedFetch } from "@/shared/lib/api";
import { apiErrorResponseSchema, type JsonValue } from "@homeworkcopy/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
    BotIcon,
    CheckIcon,
    ClipboardIcon,
    DownloadIcon,
    HistoryIcon,
    Loader2Icon,
    MessageSquarePlusIcon,
    PencilIcon,
    RefreshCwIcon,
    SaveIcon,
    ThumbsDownIcon,
    ThumbsUpIcon,
    Trash2Icon,
} from "lucide-react";
import {
    Message,
    MessageAvatar,
    MessageContent,
    MessageFooter,
    MessageGroup,
} from "@/components/ui/message";
import {
    MessageScroller,
    MessageScrollerButton,
    MessageScrollerContent,
    MessageScrollerItem,
    MessageScrollerProvider,
    MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
    buildCitationMap,
    chatKeys,
    useConversationMessages,
    useConversations,
    useDeleteConversation,
    useRenameConversation,
    useMessageFeedback,
    useSaveMessageAsOutput,
    useChatGuide,
} from "../hooks/use-conversations";
import { ChatMessageBody } from "./chat-message-body";
import { CitationSources } from "./citation-sources";
import { ChatComposer } from "./chat-composer";
import type { ChatCitation } from "../lib/types";
import { workspaceRoutes } from "@/features/workspaces/lib/routes";
import { useChatPreferences } from "../stores/chat-preferences";
import { useNotebookUiStore } from "@/features/workspaces/stores/notebook-ui-store";
import { useSources } from "@/features/sources";
import { resolveSourceSelection } from "@/features/sources/lib/grounding";
import {
    downloadMarkdown,
    exportConversationMarkdown,
} from "../lib/export-chat";
import { listConversationMessages } from "../lib/api";

type WorkspaceChatProps = {
    workspaceId: string;
    defaultModel?: string;
};

const EMPTY_SOURCE_IDS: string[] = [];

function getMessageText(message: UIMessage) {
    return message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
}

export function WorkspaceChat({
    workspaceId,
    defaultModel,
}: WorkspaceChatProps) {
    const queryClient = useQueryClient();
    const router = useRouter();
    const searchParams = useSearchParams();
    const askPrompt = searchParams.get("ask");
    const handledAskPrompt = useRef<string | null>(null);
    const conversationId = useNotebookUiStore(
        (state) => state.byNotebook[workspaceId]?.activeConversationId ?? null,
    );
    const composerDraft = useNotebookUiStore(
        (state) => state.byNotebook[workspaceId]?.composerDraft ?? "",
    );
    const sourceSelectionMode = useNotebookUiStore(
        (state) =>
            state.byNotebook[workspaceId]?.sourceSelectionMode ?? "all-ready",
    );
    const selectedSourceIds = useNotebookUiStore(
        (state) =>
            state.byNotebook[workspaceId]?.selectedSourceIds ?? EMPTY_SOURCE_IDS,
    );
    const setConversationId = useNotebookUiStore(
        (state) => state.setActiveConversationId,
    );
    const setComposerDraft = useNotebookUiStore(
        (state) => state.setComposerDraft,
    );
    const [citationsByMessageId, setCitationsByMessageId] = useState<
        Record<string, ChatCitation[]>
    >({});
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameTitle, setRenameTitle] = useState("");
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [savedMessageId, setSavedMessageId] = useState<string | null>(null);
    const lastSubmittedText = useRef<string | null>(null);

    const storedPrefs = useChatPreferences(
        (state) => state.byWorkspace[workspaceId],
    );
    const getPrefs = useChatPreferences((state) => state.getPrefs);
    const setGroundingMode = useChatPreferences(
        (state) => state.setGroundingMode,
    );
    const chatPrefs = storedPrefs
        ? {
              model: storedPrefs.model,
              groundingMode:
                  storedPrefs.groundingMode ??
                  (storedPrefs.webSearch ? "notebook-web" : "notebook"),
          }
        : getPrefs(workspaceId, defaultModel);

    const { data: conversations = [], isLoading: conversationsLoading } =
        useConversations(workspaceId);
    const {
        data: sources = [],
        isLoading: sourcesLoading,
        error: sourcesError,
    } = useSources(workspaceId);
    const sourceSelection = useMemo(
        () =>
            resolveSourceSelection(
                sources,
                sourceSelectionMode,
                selectedSourceIds,
            ),
        [sources, sourceSelectionMode, selectedSourceIds],
    );
    const sourceCounts = useMemo(
        () => ({
            ready: sources.filter((source) => source.status === "READY").length,
            processing: sources.filter(
                (source) => source.status === "PENDING" || source.status === "PROCESSING",
            ).length,
            failed: sources.filter((source) => source.status === "FAILED").length,
        }),
        [sources],
    );
    const selectionWarning = sourcesError
        ? "Could not verify the selected sources. Try again."
        : sourceSelection.exceedsSourceLimit
          ? "Choose at most 50 sources for grounding."
          : sourceSelection.unavailableSourceIds.length > 0
            ? "One or more selected sources are unavailable. Update the selection in Sources."
            : sourceSelection.effectiveSourceIds.length === 0
              ? "Select at least one ready source before asking a question."
              : undefined;
    const canSend =
        !sourcesLoading && !sourcesError && sourceSelection.canUseSelection;
    const { data: storedMessages, isLoading: messagesLoading } =
        useConversationMessages(workspaceId, conversationId);
    const deleteConversation = useDeleteConversation(workspaceId);
    const renameConversation = useRenameConversation(workspaceId);
    const messageFeedback = useMessageFeedback(workspaceId);
    const saveMessage = useSaveMessageAsOutput(workspaceId);
    const { data: chatGuide } = useChatGuide(
        workspaceId,
        sourceSelection.request,
        sourceSelection.canUseSelection && !conversationId,
    );

    const activeConversation = conversations.find(
        (conversation) => conversation.id === conversationId,
    );

    const handleConversationId = useCallback(
        (id: string) => {
            setConversationId(workspaceId, id);
            void queryClient.invalidateQueries({
                queryKey: chatKeys(workspaceId).conversations(),
            });
        },
        [queryClient, setConversationId, workspaceId],
    );

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: `/api/workspaces/${workspaceId}/chat`,
                credentials: "include",
                body: {
                    ...(conversationId ? { conversationId } : {}),
                    model: chatPrefs.model,
                    groundingMode: chatPrefs.groundingMode,
                    selectionMode: sourceSelection.request.selectionMode,
                    sourceIds: sourceSelection.request.sourceIds,
                },
                fetch: Object.assign(async (
                    url: Parameters<typeof fetch>[0],
                    init: Parameters<typeof fetch>[1],
                ) => {
                    const response = await authenticatedFetch(url, {
                        ...init,
                        credentials: "include",
                    });

                    const newConversationId =
                        response.headers.get("X-Conversation-Id");
                    if (newConversationId) {
                        handleConversationId(newConversationId);
                    }

                    if (!response.ok) {
                        const payload: JsonValue = await response
                            .clone()
                            .json()
                            .catch(() => null);
                        const parsed = apiErrorResponseSchema.safeParse(payload);
                        throw new ApiError(
                            response.status,
                            parsed.success ? parsed.data.error.code : "CHAT_FAILED",
                            parsed.success ? parsed.data.error.message : "Chat request failed",
                            parsed.success ? parsed.data.error.details : undefined,
                        );
                    }

                    return response;
                }, { preconnect: fetch.preconnect }),
            }),
        [
            workspaceId,
            conversationId,
            handleConversationId,
            chatPrefs.model,
            chatPrefs.groundingMode,
            sourceSelection.request.selectionMode,
            sourceSelection.request.sourceIds,
        ],
    );

    const {
        messages,
        sendMessage,
        setMessages,
        status,
        error,
        stop,
        regenerate,
        clearError,
    } = useChat({
        transport,
        onError: () => {
            const failedText = lastSubmittedText.current;
            if (failedText) setComposerDraft(workspaceId, failedText);
        },
    });

    const isStreaming = status === "streaming" || status === "submitted";
    const latestAssistantId = [...messages]
        .reverse()
        .find((message) => message.role === "assistant")?.id;
    const showPendingAssistant =
        status === "submitted" && messages.at(-1)?.role === "user";

    useEffect(() => {
        if (!conversationId) {
            setMessages([]);
            setCitationsByMessageId({});
            return;
        }

        if (!storedMessages || isStreaming) {
            return;
        }

        setMessages(
            storedMessages.map((message) => ({
                id: message.id,
                role: message.role === "USER" ? "user" : "assistant",
                parts: [{ type: "text" as const, text: message.content }],
            })),
        );
        setCitationsByMessageId(buildCitationMap(storedMessages));
    }, [conversationId, storedMessages, setMessages, isStreaming]);

    useEffect(() => {
        if (status !== "ready" || !conversationId) {
            return;
        }

        void queryClient.invalidateQueries({
            queryKey: chatKeys(workspaceId).messages(conversationId),
        });
    }, [status, conversationId, queryClient, workspaceId]);

    useEffect(() => {
        if (!storedMessages || status === "streaming") {
            return;
        }

        setCitationsByMessageId(buildCitationMap(storedMessages));
    }, [storedMessages, status]);

    useEffect(() => {
        if (askPrompt && conversationId) {
            setConversationId(workspaceId, null);
            setMessages([]);
            setCitationsByMessageId({});
            return;
        }

        if (
            !askPrompt ||
            !canSend ||
            status !== "ready" ||
            messages.length > 0 ||
            handledAskPrompt.current === askPrompt
        ) {
            return;
        }

        handledAskPrompt.current = askPrompt;
        void sendMessage({ text: askPrompt });
        router.replace(workspaceRoutes.detail(workspaceId));
    }, [
        askPrompt,
        status,
        conversationId,
        messages.length,
        sendMessage,
        setConversationId,
        setMessages,
        router,
        workspaceId,
        canSend,
    ]);

    async function handleNewChat() {
        if (isStreaming) await stop();
        setConversationId(workspaceId, null);
        setMessages([]);
        setCitationsByMessageId({});
    }

    async function handleDeleteConversation() {
        if (!conversationId) {
            return;
        }

        await deleteConversation.mutateAsync(conversationId);
        setDeleteOpen(false);
        await handleNewChat();
    }

    async function handleRenameConversation() {
        if (!conversationId || !renameTitle.trim()) return;
        await renameConversation.mutateAsync({
            conversationId,
            title: renameTitle.trim(),
        });
        setRenameOpen(false);
    }

    async function handleConversationSwitch(id: string) {
        if (isStreaming) await stop();
        setMessages([]);
        setCitationsByMessageId({});
        setConversationId(workspaceId, id);
    }

    async function handleCopy(messageId: string, text: string) {
        await navigator.clipboard.writeText(text);
        setCopiedMessageId(messageId);
        window.setTimeout(() => setCopiedMessageId(null), 2_000);
    }

    function handleEdit(messageId: string, text: string) {
        setEditingMessageId(messageId);
        setComposerDraft(workspaceId, text);
    }

    async function handleRetry(messageId: string) {
        clearError();
        await regenerate({ messageId });
    }

    async function reloadConversationMessages(id: string) {
        const recovered = await queryClient.fetchQuery({
            queryKey: chatKeys(workspaceId).messages(id),
            queryFn: () => listConversationMessages(workspaceId, id),
            staleTime: 0,
        });
        setMessages(
            recovered.map((message) => ({
                id: message.id,
                role: message.role === "USER" ? "user" : "assistant",
                parts: [{ type: "text", text: message.content }],
            })),
        );
        setCitationsByMessageId(buildCitationMap(recovered));
        return recovered;
    }

    async function handleStop() {
        await stop();
        if (conversationId) await reloadConversationMessages(conversationId);
    }

    async function handleRecover() {
        clearError();
        if (!conversationId) {
            await sendMessage();
            return;
        }
        const recovered = await reloadConversationMessages(conversationId);
        const lastMessage = recovered.at(-1);
        if (lastMessage?.role === "USER") {
            lastSubmittedText.current = lastMessage.content;
            await sendMessage();
        } else {
            setComposerDraft(workspaceId, "");
        }
    }

    function handleExportChat() {
        if (messages.length === 0) {
            return;
        }

        const markdown = exportConversationMarkdown({
            conversation: activeConversation ?? null,
            messages,
            citationsByMessageId,
        });
        const slug =
            activeConversation?.title?.replace(/[^\w-]+/g, "-").toLowerCase() ??
            "chat";
        downloadMarkdown(markdown, `${slug}-${Date.now()}.md`);
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center gap-2 border-b px-4 py-3">
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="outline"
                                size="sm"
                                className="max-w-sm justify-start"
                            />
                        }
                    >
                        <HistoryIcon />
                        <span className="truncate">
                            {activeConversation?.title ?? "Conversation history"}
                        </span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-72">
                        <DropdownMenuLabel>Conversations</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => void handleNewChat()}>
                            <MessageSquarePlusIcon /> New chat
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {conversations.length === 0 ? (
                            <DropdownMenuItem disabled>No saved conversations</DropdownMenuItem>
                        ) : conversations.map((conversation) => (
                            <DropdownMenuItem
                                key={conversation.id}
                                onClick={() => void handleConversationSwitch(conversation.id)}
                            >
                                <span className="truncate">
                                    {conversation.title ?? "Untitled chat"}
                                </span>
                                {conversation.id === conversationId ? <CheckIcon className="ml-auto" /> : null}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleNewChat()}
                >
                    <MessageSquarePlusIcon />
                    New
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    disabled={messages.length === 0}
                    onClick={handleExportChat}
                >
                    <DownloadIcon />
                    Export
                </Button>

                {conversationId ? (
                    <>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Rename conversation"
                            onClick={() => {
                                setRenameTitle(activeConversation?.title ?? "");
                                setRenameOpen(true);
                            }}
                        >
                            <PencilIcon />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete conversation"
                            onClick={() => setDeleteOpen(true)}
                            disabled={deleteConversation.isPending}
                        >
                            <Trash2Icon />
                        </Button>
                    </>
                ) : null}
            </div>

            {sourceCounts.failed > 0 && sourceCounts.ready > 0 ? (
                <div role="status" className="border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
                    {sourceCounts.failed} source{sourceCounts.failed === 1 ? "" : "s"} failed to process. Chat will use the ready selected sources only.
                </div>
            ) : null}

            <MessageScrollerProvider>
                <MessageScroller className="min-h-0 flex-1">
                    <MessageScrollerViewport>
                        <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
                            {(conversationsLoading || messagesLoading) &&
                            messages.length === 0 ? (
                                <div className="space-y-4">
                                    <Skeleton className="h-16 w-2/3 rounded-3xl" />
                                    <Skeleton className="ml-auto h-16 w-1/2 rounded-3xl" />
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                                    <div className="rounded-full bg-muted p-3">
                                        <BotIcon className="size-6" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium">
                                            {sources.length === 0
                                                ? "Add your first source"
                                                : sourceCounts.ready === 0 && sourceCounts.processing > 0
                                                  ? "Your sources are being prepared"
                                                  : sourceCounts.ready === 0
                                                    ? "No sources are ready"
                                                    : "Your notebook is ready"}
                                        </p>
                                        <p className="max-w-sm text-sm text-muted-foreground">
                                            {sources.length === 0
                                                ? "Add trusted material to start a grounded conversation."
                                                : sourceCounts.ready === 0 && sourceCounts.processing > 0
                                                  ? "Grounded chat becomes available as soon as a source finishes processing."
                                                  : sourceCounts.ready === 0
                                                    ? "Retry a failed source or add another source to begin."
                                                    : chatGuide?.overview ?? "Ask questions about the selected material and verify answers with citations."}
                                        </p>
                                    </div>
                                    {sourceCounts.ready > 0 && chatGuide ? (
                                        <div className="mt-3 grid w-full max-w-xl gap-2" aria-label="Suggested questions">
                                            {chatGuide.questions.map((question) => (
                                                <Button
                                                    key={question}
                                                    variant="outline"
                                                    className="h-auto justify-start whitespace-normal py-3 text-left"
                                                    disabled={!canSend}
                                                    onClick={() => {
                                                        lastSubmittedText.current = question;
                                                        void sendMessage({ text: question });
                                                    }}
                                                >
                                                    {question}
                                                </Button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <MessageGroup className="gap-6">
                                    {messages.map((message, messageIndex) => {
                                        const isUser = message.role === "user";
                                        const citations =
                                            citationsByMessageId[message.id];
                                        const isLastMessage =
                                            messageIndex === messages.length - 1;
                                        const isAnimatingMessage =
                                            !isUser &&
                                            isStreaming &&
                                            isLastMessage;

                                        return (
                                            <MessageScrollerItem
                                                key={message.id}
                                                scrollAnchor
                                            >
                                                <Message
                                                    align={
                                                        isUser ? "end" : "start"
                                                    }
                                                >
                                                    {!isUser ? (
                                                        <MessageAvatar className="size-8">
                                                            <BotIcon className="size-4" />
                                                        </MessageAvatar>
                                                    ) : null}
                                                    <MessageContent>
                                                        <Bubble
                                                            align={
                                                                isUser
                                                                    ? "end"
                                                                    : "start"
                                                            }
                                                            variant={
                                                                isUser
                                                                    ? "default"
                                                                    : "ghost"
                                                            }
                                                        >
                                                            <BubbleContent
                                                                className={
                                                                    isUser
                                                                        ? "font-heading text-lg font-medium leading-7"
                                                                        : "leading-relaxed"
                                                                }
                                                            >
                                                                {isUser ? (
                                                                    getMessageText(
                                                                        message,
                                                                    )
                                                                ) : (
                                                                    <ChatMessageBody
                                                                        text={getMessageText(
                                                                            message,
                                                                        )}
                                                                        citations={
                                                                            citations
                                                                        }
                                                                        workspaceId={
                                                                            workspaceId
                                                                        }
                                                                        isAnimating={
                                                                            isAnimatingMessage
                                                                        }
                                                                    />
                                                                )}
                                                            </BubbleContent>
                                                        </Bubble>
                                                        {!isUser &&
                                                        citations?.length ? (
                                                            <MessageFooter className="mt-1 w-full max-w-full flex-col items-start gap-0 px-0">
                                                                <CitationSources
                                                                    workspaceId={
                                                                        workspaceId
                                                                    }
                                                                    citations={
                                                                        citations
                                                                    }
                                                                />
                                                            </MessageFooter>
                                                        ) : null}
                                                        {!isAnimatingMessage ? (
                                                            <MessageFooter className="mt-1 flex flex-wrap gap-1 px-0">
                                                                {isUser ? (
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon-sm"
                                                                        aria-label="Edit question"
                                                                        onClick={() => handleEdit(message.id, getMessageText(message))}
                                                                    >
                                                                        <PencilIcon />
                                                                    </Button>
                                                                ) : (
                                                                    <>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            aria-label="Copy answer"
                                                                            onClick={() => void handleCopy(message.id, getMessageText(message))}
                                                                        >
                                                                            {copiedMessageId === message.id ? <CheckIcon /> : <ClipboardIcon />}
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            aria-label="Regenerate answer"
                                                                            disabled={isStreaming || message.id !== latestAssistantId}
                                                                            onClick={() => void handleRetry(message.id)}
                                                                        >
                                                                            <RefreshCwIcon />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            aria-label="Mark answer helpful"
                                                                            disabled={!conversationId}
                                                                            onClick={() => conversationId && messageFeedback.mutate({ conversationId, messageId: message.id, feedback: "HELPFUL" })}
                                                                        >
                                                                            <ThumbsUpIcon />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            aria-label="Mark answer not helpful"
                                                                            disabled={!conversationId}
                                                                            onClick={() => conversationId && messageFeedback.mutate({ conversationId, messageId: message.id, feedback: "NOT_HELPFUL" })}
                                                                        >
                                                                            <ThumbsDownIcon />
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            aria-label="Save answer as output"
                                                                            disabled={!conversationId || saveMessage.isPending}
                                                                            onClick={() => {
                                                                                if (!conversationId) return;
                                                                                saveMessage.mutate(
                                                                                    { conversationId, messageId: message.id },
                                                                                    { onSuccess: () => setSavedMessageId(message.id) },
                                                                                );
                                                                            }}
                                                                        >
                                                                            {savedMessageId === message.id ? <CheckIcon /> : <SaveIcon />}
                                                                        </Button>
                                                                    </>
                                                                )}
                                                            </MessageFooter>
                                                        ) : null}
                                                    </MessageContent>
                                                </Message>
                                            </MessageScrollerItem>
                                        );
                                    })}
                                    {showPendingAssistant ? (
                                        <MessageScrollerItem scrollAnchor>
                                            <Message align="start">
                                                <MessageAvatar className="size-8">
                                                    <BotIcon className="size-4" />
                                                </MessageAvatar>
                                                <MessageContent>
                                                    <Bubble
                                                        align="start"
                                                        variant="ghost"
                                                    >
                                                        <BubbleContent className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                                                            <Loader2Icon className="size-4 animate-spin" />
                                                            Searching your selected sources…
                                                        </BubbleContent>
                                                    </Bubble>
                                                </MessageContent>
                                            </Message>
                                        </MessageScrollerItem>
                                    ) : null}
                                </MessageGroup>
                            )}
                        </MessageScrollerContent>
                    </MessageScrollerViewport>
                    <MessageScrollerButton direction="end" />
                </MessageScroller>
            </MessageScrollerProvider>

            {error ? (
                <div role="alert" className="flex items-center justify-between gap-3 border-t bg-destructive/5 px-4 py-2 text-sm text-destructive">
                    <span>{error.message}</span>
                    {!(error instanceof ApiError && error.code === "CHAT_QUOTA_EXCEEDED") ? (
                        <Button variant="outline" size="sm" onClick={() => void handleRecover()}>
                            Recover
                        </Button>
                    ) : null}
                </div>
            ) : null}

            <ChatComposer
                disabled={!canSend}
                isStreaming={isStreaming}
                groundingMode={chatPrefs.groundingMode}
                onGroundingModeChange={(mode) =>
                    setGroundingMode(workspaceId, mode)
                }
                selectedSourceCount={sourceSelection.effectiveSourceIds.length}
                selectionWarning={selectionWarning}
                value={composerDraft}
                onValueChange={(value) => setComposerDraft(workspaceId, value)}
                onStop={() => void handleStop()}
                onSourceAction={() => {
                    const notebookState = useNotebookUiStore.getState();
                    notebookState.setPanelCollapsed(workspaceId, "sources", false);
                    notebookState.setMobileTab(workspaceId, "sources");
                }}
                editing={editingMessageId !== null}
                onCancelEdit={() => {
                    setEditingMessageId(null);
                    setComposerDraft(workspaceId, "");
                }}
                onSubmit={(text) => {
                    lastSubmittedText.current = text;
                    const messageId = editingMessageId;
                    setEditingMessageId(null);
                    void sendMessage(messageId ? { text, messageId } : { text });
                }}
            />

            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename conversation</DialogTitle>
                        <DialogDescription>Use a short title that makes this research thread easy to find.</DialogDescription>
                    </DialogHeader>
                    <Input
                        value={renameTitle}
                        maxLength={120}
                        autoFocus
                        onChange={(event) => setRenameTitle(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") void handleRenameConversation();
                        }}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
                        <Button disabled={!renameTitle.trim() || renameConversation.isPending} onClick={() => void handleRenameConversation()}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                        <AlertDialogDescription>This removes the full message history and cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleteConversation.isPending}
                            onClick={() => void handleDeleteConversation()}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
