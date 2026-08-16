/**
 * Chat and conversation business logic.
 *
 * Handles CRUD for conversations/messages and the main RAG chat streaming pipeline:
 *
 * ```
 * User message
 *   → save to DB
 *   → RAG retrieval + Mem0 memories
 *   → streamText (AI SDK) with optional web search tool
 *   → save assistant reply + citations
 *   → optional summary job + Mem0 learning
 * ```
 */

import { openai } from "@ai-sdk/openai";
import type { Response } from "express";
import { z } from "zod";
import {
    convertToModelMessages,
    createUIMessageStream,
    isStepCount,
    pipeUIMessageStreamToResponse,
    smoothStream,
    streamText,
    toUIMessageStream,
    tool,
    type UIMessage,
    type LanguageModelUsage,
} from "ai";
import {
    CHAT_MODEL,
    CHAT_MODELS,
    CONVERSATION_SUMMARY_INTERVAL,
    RECENT_MESSAGE_WINDOW,
    CHAT_MAX_OUTPUT_TOKENS,
} from "../lib/ai-config.js";
import { enqueueConversationSummarize } from "../lib/conversation-events.js";
import {
    buildChatSystemPrompt,
    retrieveWorkspaceContext,
    rewriteFollowUpQuery,
} from "../lib/rag/retrieve.js";
import {
    createConversationRecord,
    findConversationByIdAndWorkspaceId,
    findConversationsByWorkspaceId,
    touchConversation,
    updateConversationRecord,
    deleteConversationRecord,
    claimConversationGeneration,
    releaseConversationGeneration,
} from "../repositories/conversation.repository.js";
import {
    createAssistantMessageWithValidatedCitations,
    countMessagesByConversationId,
    findMessagesByConversationId,
    prepareChatUserMessage,
    updateMessageFeedback,
} from "../repositories/message.repository.js";
import { findExistingSourceIds } from "../repositories/source.repository.js";
import { findExistingChunkIds } from "../repositories/source-chunk.repository.js";
import { addMemoriesFromMessages, searchUserMemories } from "../lib/mem0.js";
import {
    formatTavilyResultsForPrompt,
    searchWeb,
} from "../lib/tavily.js";
import {
    NotFoundError,
    ValidationError,
    WebSearchUnavailableError,
} from "../types/app-error.js";
import {
    buildConversationTitle,
    getLastUserMessageText,
    getTextFromUIMessage,
} from "../utils/chat-message.js";
import { getWorkspaceByIdForUser } from "./workspace.service.js";
import { resolveReadySourcesForWorkspace } from "./source.service.js";
import {
    RETRIEVAL_VERSION,
    citationEnvelopeSchema,
    type Citation,
    type GroundingMode,
    type GroundingSnapshot,
    type SourceCitation,
    type SourceSelectionMode,
    type WebCitation,
    CHAT_WEB_QUERY_MAX_LENGTH,
    type ChatTrigger,
    type MessageFeedback,
    OUTPUT_CONTENT_VERSION,
    OUTPUT_METADATA_VERSION,
    summaryOutputContentSchema,
    type OutputMetadata,
} from "@homeworkcopy/contracts";
import { toPrismaJson } from "../utils/prisma-json.js";
import { logger } from "../lib/logger.js";
import {
    reconcileChatQuota,
    reserveChatQuota,
    validateChatMessageLengths,
} from "./chat-quota.service.js";
import { createArtifactRecord } from "../repositories/artifact.repository.js";

/**
 * Lists all conversations in a workspace for the sidebar/history UI.
 *
 * @param workspaceId - Workspace to list conversations from
 * @param userId - Authenticated user's id
 * @returns Conversation records ordered by most recent activity
 *
 */
export async function listConversationsForWorkspace(
    workspaceId: string,
    userId: string,
) {
    await getWorkspaceByIdForUser(workspaceId, userId);
    return findConversationsByWorkspaceId(workspaceId);
}

/**
 * Creates an empty conversation (optional title).
 *
 * Most chats are created implicitly on first message via {@link streamWorkspaceChat};
 * this endpoint supports explicit "new chat" actions from the UI.
 *
 * @param workspaceId - Workspace to attach the conversation to
 * @param userId - Authenticated user's id
 * @param title - Optional display title
 * @returns New conversation record
 *
 */
export async function createConversationForWorkspace(
    workspaceId: string,
    userId: string,
    title?: string,
) {
    await getWorkspaceByIdForUser(workspaceId, userId);
    return createConversationRecord(workspaceId, title);
}

/**
 * Loads persisted message history for a conversation.
 *
 * @param workspaceId - Workspace the conversation belongs to
 * @param conversationId - Conversation to load messages for
 * @param userId - Authenticated user's id
 * @returns Message rows with role, content, citations, and timestamps
 * @throws {NotFoundError} When the conversation does not exist in this workspace
 *
 */
export async function getConversationMessagesForWorkspace(
    workspaceId: string,
    conversationId: string,
    userId: string,
) {
    await getWorkspaceByIdForUser(workspaceId, userId);

    const conversation = await findConversationByIdAndWorkspaceId(
        conversationId,
        workspaceId,
    );

    if (!conversation) {
        throw new NotFoundError("Conversation not found");
    }

    const messages = await findMessagesByConversationId(conversationId);
    const parsedCitations = messages.map((message) =>
        citationEnvelopeSchema.safeParse(message.citations),
    );
    const sourceIds = [
        ...new Set(
            parsedCitations.flatMap((parsed) =>
                parsed.success
                    ? parsed.data.items.flatMap((citation) =>
                          citation.kind === "source" ? [citation.sourceId] : [],
                      )
                    : [],
            ),
        ),
    ];
    const chunkIds = [
        ...new Set(
            parsedCitations.flatMap((parsed) =>
                parsed.success
                    ? parsed.data.items.flatMap((citation) =>
                          citation.kind === "source" && citation.chunkId
                              ? [citation.chunkId]
                              : [],
                      )
                    : [],
            ),
        ),
    ];
    const [existingSources, existingChunks] = await Promise.all([
        findExistingSourceIds(workspaceId, sourceIds),
        findExistingChunkIds(workspaceId, chunkIds),
    ]);
    const existingSourceIds = new Set(existingSources.map((source) => source.id));
    const existingChunkIds = new Set(existingChunks.map((chunk) => chunk.id));

    function withAvailability(citation: Citation): Citation {
        if (citation.kind === "web") return citation;
        if (!existingSourceIds.has(citation.sourceId)) {
            return { ...citation, availability: "source-unavailable" };
        }
        if (citation.chunkId && !existingChunkIds.has(citation.chunkId)) {
            return { ...citation, availability: "chunk-unavailable" };
        }
        return { ...citation, availability: "available" };
    }

    return messages.map((message, index) => {
        const parsed = parsedCitations[index];
        if (!parsed?.success) return message;
        return {
            ...message,
            citations: {
                version: 1,
                items: parsed.data.items.map(withAvailability),
            },
        };
    });
}

/**
 * Deletes a conversation and all its messages (cascade).
 *
 * @param workspaceId - Workspace the conversation belongs to
 * @param conversationId - Conversation to delete
 * @param userId - Authenticated user's id
 * @returns Resolves when the conversation row is deleted
 * @throws {NotFoundError} When the conversation does not exist
 *
 */
export async function deleteConversationForWorkspace(
    workspaceId: string,
    conversationId: string,
    userId: string,
) {
    await getWorkspaceByIdForUser(workspaceId, userId);

    const conversation = await findConversationByIdAndWorkspaceId(
        conversationId,
        workspaceId,
    );

    if (!conversation) {
        throw new NotFoundError("Conversation not found");
    }

    await deleteConversationRecord(conversationId);
}

export async function renameConversationForWorkspace(
    workspaceId: string,
    conversationId: string,
    userId: string,
    title: string,
) {
    await getWorkspaceByIdForUser(workspaceId, userId);
    const conversation = await findConversationByIdAndWorkspaceId(
        conversationId,
        workspaceId,
    );
    if (!conversation) throw new NotFoundError("Conversation not found");
    return updateConversationRecord(conversationId, { title });
}

export async function setMessageFeedbackForWorkspace(
    workspaceId: string,
    conversationId: string,
    messageId: string,
    userId: string,
    feedback: MessageFeedback,
) {
    await getWorkspaceByIdForUser(workspaceId, userId);
    const conversation = await findConversationByIdAndWorkspaceId(
        conversationId,
        workspaceId,
    );
    if (!conversation) throw new NotFoundError("Conversation not found");
    return updateMessageFeedback({ conversationId, messageId, feedback });
}

export async function saveMessageAsOutputForWorkspace(
    workspaceId: string,
    conversationId: string,
    messageId: string,
    userId: string,
) {
    await getWorkspaceByIdForUser(workspaceId, userId);
    const conversation = await findConversationByIdAndWorkspaceId(
        conversationId,
        workspaceId,
    );
    if (!conversation) throw new NotFoundError("Conversation not found");
    const messages = await findMessagesByConversationId(conversationId);
    const message = messages.find(
        (candidate) =>
            candidate.role === "ASSISTANT" &&
            (candidate.id === messageId || candidate.clientMessageId === messageId),
    );
    if (!message) throw new NotFoundError("Answer not found");

    const content = summaryOutputContentSchema.safeParse({
        markdown: message.content,
    });
    if (!content.success) {
        throw new ValidationError("This answer has no text to save.");
    }

    const grounding = citationEnvelopeSchema.safeParse(message.citations);
    const sourceIds = grounding.success
        ? [...new Set(grounding.data.items.flatMap((citation) =>
              citation.kind === "source" ? [citation.sourceId] : [],
          ))]
        : [];
    const metadata: OutputMetadata = {
        version: OUTPUT_METADATA_VERSION,
        generatedAt: new Date().toISOString(),
        savedFrom: { conversationId, messageId: message.id },
    };

    return createArtifactRecord({
        workspaceId,
        type: "SUMMARY",
        title: `Saved answer · ${new Date().toLocaleDateString()}`,
        sourceIds,
        status: "READY",
        stage: "READY",
        attemptCount: 1,
        contentVersion: OUTPUT_CONTENT_VERSION,
        content: toPrismaJson(content.data),
        metadata: toPrismaJson(metadata),
    });
}

export async function getChatGuideForWorkspace(
    workspaceId: string,
    userId: string,
    selection: { selectionMode: SourceSelectionMode; sourceIds: string[] },
) {
    const sources = await resolveReadySourcesForWorkspace(
        workspaceId,
        userId,
        selection,
    );
    const titles = sources.slice(0, 4).map((source) => source.title);
    const questions = titles.slice(0, 3).map(
        (title) => `What are the main ideas and supporting details in “${title}”?`,
    );
    if (questions.length < 4 && sources.length > 1) {
        questions.push("How do the selected sources agree, differ, or build on one another?");
    }
    while (questions.length < 3) {
        questions.push(
            questions.length === 0
                ? "What are the most important ideas in the selected sources?"
                : questions.length === 1
                  ? "Which evidence best supports the central claims?"
                  : "What should I review first to understand this material?",
        );
    }
    return {
        overview: `This notebook is ready to research with ${sources.length} selected ${sources.length === 1 ? "source" : "sources"}: ${titles.join(", ")}.`,
        questions: questions.slice(0, 4),
        sourceIds: sources.map((source) => source.id),
    };
}

/**
 * Finds an existing conversation or creates one from the first user message.
 *
 * @param workspaceId - Workspace scope
 * @param conversationId - Existing id from client, or undefined for a new chat
 * @param firstMessage - User text used to auto-generate a title for new conversations
 * @returns Conversation record (existing or newly created)
 * @throws {NotFoundError} When `conversationId` is provided but not found
 *
 *
 */
async function resolveConversation(
    workspaceId: string,
    conversationId: string | undefined,
    firstMessage: string,
) {
    if (conversationId) {
        const existing = await findConversationByIdAndWorkspaceId(
            conversationId,
            workspaceId,
        );

        if (!existing) {
            throw new NotFoundError("Conversation not found");
        }

        return existing;
    }

    void firstMessage;
    return createConversationRecord(workspaceId);
}

function toUIMessage(message: Awaited<ReturnType<typeof findMessagesByConversationId>>[number]): UIMessage {
    return {
        id: message.clientMessageId ?? message.id,
        role: message.role === "USER" ? "user" : "assistant",
        parts: [{ type: "text", text: message.content }],
    };
}

/**
 * Main RAG chat endpoint: streams an AI reply with workspace context and optional web search.
 *
 * **Pipeline:**
 * 1. Validate user message and resolve/create conversation
 * 2. Save user message to Postgres
 * 3. Parallel: Pinecone RAG retrieval + Mem0 memory search
 * 4. Build system prompt and stream model response via AI SDK
 * 5. On finish: save assistant message, citations, title, summary job, Mem0 learning
 *
 * @param res - Express response (streamed via `pipeUIMessageStreamToResponse`)
 * @param workspaceId - Workspace whose sources to search
 * @param userId - Authenticated user's id
 * @param input - Client chat payload from `useChat`
 * @returns Writes UI message stream to `res`; sets `X-Conversation-Id` header
 * @throws {ValidationError} When no user message text is present
 * @throws {NotFoundError} When conversation or workspace is not found
 *
 *
 */
export async function streamWorkspaceChat(
    res: Response,
    workspaceId: string,
    userId: string,
    input: {
        conversationId?: string;
        messages: UIMessage[];
        model?: string;
        selectionMode: SourceSelectionMode;
        sourceIds: string[];
        groundingMode: GroundingMode;
        trigger: ChatTrigger;
        messageId?: string;
        abortSignal: AbortSignal;
    },
) {
    validateChatMessageLengths(input.messages);
    const workspace = await getWorkspaceByIdForUser(workspaceId, userId);
    const requestedModel = input.model ?? workspace.defaultModel;
    const chatModel =
        CHAT_MODELS.find((model) => model === requestedModel) ?? CHAT_MODEL;
    const webSearchEnabled = input.groundingMode === "notebook-web";
    if (webSearchEnabled && !process.env.TAVILY_API_KEY?.trim()) {
        throw new WebSearchUnavailableError();
    }

    const userText = getLastUserMessageText(input.messages);
    if (!userText) {
        throw new ValidationError("A user message is required");
    }
    const userMessage = [...input.messages]
        .reverse()
        .find((message) => message.role === "user");
    if (!userMessage) throw new ValidationError("A user message is required");

    const selectedSources = await resolveReadySourcesForWorkspace(
        workspaceId,
        userId,
        {
            selectionMode: input.selectionMode,
            sourceIds: input.sourceIds,
        },
    );
    const resolvedSourceIds = selectedSources.map((source) => source.id);
    const grounding: GroundingSnapshot = {
        version: 1,
        selectionMode: input.selectionMode,
        groundingMode: input.groundingMode,
        sourceIds: resolvedSourceIds,
        retrievalVersion: RETRIEVAL_VERSION,
    };
    const conversation = await resolveConversation(
        workspaceId,
        input.conversationId,
        userText,
    );
    res.setHeader("X-Conversation-Id", conversation.id);
    const generationLeaseId = await claimConversationGeneration(conversation.id);

    let preparedTurn: Awaited<ReturnType<typeof prepareChatUserMessage>>;
    try {
        preparedTurn = await prepareChatUserMessage({
            conversationId: conversation.id,
            clientMessageId: userMessage.id,
            content: userText,
            grounding,
            trigger: input.trigger,
            targetMessageId: input.messageId,
        });
    } catch (error) {
        await releaseConversationGeneration(conversation.id, generationLeaseId);
        throw error;
    }
    const persistedMessages = await findMessagesByConversationId(conversation.id);
    const editIndex = preparedTurn.pendingEdit
        ? persistedMessages.findIndex(
              (message) => message.id === preparedTurn.pendingEdit?.id,
          )
        : -1;
    const branchMessages = editIndex >= 0
        ? persistedMessages.slice(0, editIndex + 1)
        : persistedMessages;
    const authoritativeMessages = branchMessages
        .filter((message) => message.id !== preparedTurn.retryOfId)
        .map((message) =>
            preparedTurn.pendingEdit?.id === message.id
                ? toUIMessage(preparedTurn.userMessage)
                : toUIMessage(message),
        );
    const effectiveSummary = preparedTurn.pendingEdit || preparedTurn.retryOfId
        ? null
        : conversation.summary;

    const retrievalQuery = rewriteFollowUpQuery(
        authoritativeMessages,
        effectiveSummary,
    );
    let retrieval: Awaited<ReturnType<typeof retrieveWorkspaceContext>>;
    let userMemories: Awaited<ReturnType<typeof searchUserMemories>>;
    try {
        [retrieval, userMemories] = await Promise.all([
            retrieveWorkspaceContext({
                workspaceId,
                sourceIds: resolvedSourceIds,
                query: retrievalQuery,
            }),
            searchUserMemories(userId, userText),
        ]);
    } catch (error) {
        await releaseConversationGeneration(conversation.id, generationLeaseId);
        throw error;
    }
    const retrievedChunks = retrieval.chunks;
    logger.info(
        {
            workspaceId,
            conversationId: conversation.id,
            groundingMode: input.groundingMode,
            selectionMode: input.selectionMode,
            ...retrieval.diagnostics,
        },
        "grounding retrieval completed",
    );

    const citations: SourceCitation[] = retrievedChunks.map((chunk, index) => ({
        kind: "source",
        label: String(index + 1),
        sourceId: chunk.sourceId,
        sourceType: chunk.sourceType,
        title: chunk.sourceTitle,
        excerpt: chunk.text.slice(0, 280),
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        ...(chunk.page === undefined ? {} : { page: chunk.page }),
        ...(chunk.timestamp === undefined ? {} : { timestamp: chunk.timestamp }),
        provenance: { provider: chunk.retrievalProvider, score: chunk.score },
    }));
    const systemPrompt = buildChatSystemPrompt({
        chunks: retrievedChunks,
        conversationSummary: effectiveSummary,
        userMemories: userMemories.map((memory) => memory.memory),
        groundingMode: input.groundingMode,
    });

    const contextMessages =
        effectiveSummary &&
        authoritativeMessages.length > RECENT_MESSAGE_WINDOW
            ? authoritativeMessages.slice(-RECENT_MESSAGE_WINDOW)
            : authoritativeMessages;

    let quotaReservation: Awaited<ReturnType<typeof reserveChatQuota>>;
    try {
        quotaReservation = await reserveChatQuota(
            userId,
            contextMessages,
            systemPrompt.length + (webSearchEnabled ? 100_000 : 0),
            webSearchEnabled
                ? CHAT_MAX_OUTPUT_TOKENS * 3
                : CHAT_MAX_OUTPUT_TOKENS,
        );
    } catch (error) {
        await releaseConversationGeneration(conversation.id, generationLeaseId);
        throw error;
    }

    const webCitations: WebCitation[] = [];
    let generationUsage: Promise<LanguageModelUsage> | undefined;

    const stream = createUIMessageStream({
        originalMessages: input.messages,
        execute: async ({ writer }) => {
            const tools =
                webSearchEnabled
                    ? {
                          web_search: tool({
                              description:
                                  "Search the web for up-to-date information outside the notebook sources.",
                              inputSchema: z.object({
                                  query: z
                                      .string()
                                      .trim()
                                      .min(1)
                                      .max(CHAT_WEB_QUERY_MAX_LENGTH)
                                      .describe(
                                          "The search query for current web information",
                                      ),
                              }),
                              execute: async ({ query }) => {
                                  const results = await searchWeb(query);
                                  const validResults = results.results.flatMap((result) => {
                                      const url = z.url({ protocol: /^https?$/ }).safeParse(result.url);
                                      return url.success ? [{ ...result, url: url.data }] : [];
                                  });
                                  const firstIndex = webCitations.length + 1;
                                  for (const [index, result] of validResults.entries()) {
                                      webCitations.push({
                                          kind: "web",
                                          label: `W${firstIndex + index}`,
                                          title: result.title,
                                          url: result.url,
                                          excerpt: result.content.slice(0, 280),
                                          provenance: {
                                              provider: "tavily",
                                              query: results.query,
                                              ...(result.score === undefined ? {} : { score: result.score }),
                                          },
                                      });
                                  }
                                  return formatTavilyResultsForPrompt(
                                      { ...results, results: validResults },
                                      firstIndex,
                                  );
                              },
                          }),
                      }
                    : undefined;

            const result = streamText({
                model: openai(chatModel),
                system: systemPrompt,
                messages: await convertToModelMessages(contextMessages),
                tools,
                stopWhen: webSearchEnabled ? isStepCount(3) : undefined,
                experimental_transform: smoothStream(),
                abortSignal: AbortSignal.any([
                    input.abortSignal,
                    AbortSignal.timeout(2 * 60 * 1_000),
                ]),
                maxOutputTokens: CHAT_MAX_OUTPUT_TOKENS,
            });
            generationUsage = Promise.resolve(result.usage);

            writer.merge(toUIMessageStream({ stream: result.stream }));
        },
        onFinish: async ({ responseMessage, isAborted, finishReason }) => {
            if (generationUsage) {
                void generationUsage
                    .then((usage) =>
                        reconcileChatQuota(userId, quotaReservation, usage),
                    )
                    .catch((error) => {
                        logger.warn(
                            { error, userId, conversationId: conversation.id },
                            "chat usage reconciliation failed",
                        );
                    });
            }
            if (isAborted) {
                await releaseConversationGeneration(conversation.id, generationLeaseId);
                return;
            }

            if (finishReason !== "stop" && finishReason !== "length") {
                await releaseConversationGeneration(conversation.id, generationLeaseId);
                return;
            }

            const assistantText = getTextFromUIMessage(responseMessage).trim();
            if (!assistantText) {
                await releaseConversationGeneration(conversation.id, generationLeaseId);
                return;
            }

            const citedLabels = new Set(
                [...assistantText.matchAll(/\[(W?\d+)\]/g)].flatMap((match) =>
                    match[1] ? [match[1]] : [],
                ),
            );
            const allCitations = [...citations, ...webCitations].filter(
                (citation) => citedLabels.has(citation.label),
            );

            logger.info(
                {
                    workspaceId,
                    conversationId: conversation.id,
                    selectedSourceCount: resolvedSourceIds.length,
                    retrievedChunkCount: retrievedChunks.length,
                    citedChunkCount: allCitations.filter(
                        (citation) => citation.kind === "source",
                    ).length,
                    webCitationCount: allCitations.filter(
                        (citation) => citation.kind === "web",
                    ).length,
                    noContext: retrievedChunks.length === 0,
                },
                "grounded response completed",
            );

            await createAssistantMessageWithValidatedCitations(workspaceId, {
                conversationId: conversation.id,
                role: "ASSISTANT",
                content: assistantText,
                citations: { version: 1, items: allCitations },
                grounding,
                clientMessageId: responseMessage.id,
                retryOfId: preparedTurn.retryOfId,
                pendingEdit: preparedTurn.pendingEdit,
                generationLeaseId,
            });

            void touchConversation(conversation.id).catch((error) => {
                logger.warn({ error, conversationId: conversation.id }, "conversation touch failed");
            });

            if (!conversation.title) {
                void updateConversationRecord(conversation.id, {
                    title: buildConversationTitle(userText),
                }).catch((error) => {
                    logger.warn({ error, conversationId: conversation.id }, "conversation title update failed");
                });
            }

            void countMessagesByConversationId(conversation.id)
                .then((messageCount) => {
                    if (messageCount % CONVERSATION_SUMMARY_INTERVAL !== 0) return;
                    return enqueueConversationSummarize({
                        conversationId: conversation.id,
                        userId,
                    });
                })
                .catch((error) => {
                    logger.warn({ error, conversationId: conversation.id }, "conversation summary enqueue failed");
                });

            void addMemoriesFromMessages(
                userId,
                [
                    { role: "user", content: userText },
                    { role: "assistant", content: assistantText },
                ],
                {
                    source: "learned",
                    conversationId: conversation.id,
                },
            ).catch((error) => {
                logger.warn(
                    { error, conversationId: conversation.id, userId },
                    "Mem0 add failed",
                );
            });
        },
    });

    try {
        await pipeUIMessageStreamToResponse({
            response: res,
            stream,
            headers: {
                "X-Conversation-Id": conversation.id,
                "Content-Encoding": "none",
                "Cache-Control": "no-cache, no-transform",
                "X-Accel-Buffering": "no",
            },
        });
    } catch (error) {
        await releaseConversationGeneration(conversation.id, generationLeaseId);
        throw error;
    }
}
