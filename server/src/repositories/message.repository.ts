import { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";
import type {
    CitationEnvelope,
    GroundingSnapshot,
    SourceCitation,
} from "@homeworkcopy/contracts";
import { citationEnvelopeSchema } from "@homeworkcopy/contracts";
import { ConflictError, ValidationError } from "../types/app-error.js";

export const messageSelect = {
    id: true,
    conversationId: true,
    role: true,
    content: true,
    citations: true,
    grounding: true,
    clientMessageId: true,
    retryOfId: true,
    supersededAt: true,
    feedback: true,
    createdAt: true,
} as const;

export type MessageRecord = Prisma.MessageGetPayload<{
    select: typeof messageSelect;
}>;

export type CreateMessageData = {
    conversationId: string;
    role: MessageRecord["role"];
    content: string;
    citations?: CitationEnvelope;
    grounding?: GroundingSnapshot;
    clientMessageId?: string;
    retryOfId?: string;
};

type PendingUserEdit = {
    id: string;
    content: string;
    grounding: GroundingSnapshot;
};

export function findMessagesByConversationId(conversationId: string) {
    return prisma.message.findMany({
        where: { conversationId, supersededAt: null },
        select: messageSelect,
        orderBy: { createdAt: "asc" },
    });
}

export function countMessagesByConversationId(conversationId: string) {
    return prisma.message.count({
        where: { conversationId, supersededAt: null },
    });
}

export function createMessageRecord(data: CreateMessageData) {
    return prisma.message.create({
        data: {
            conversationId: data.conversationId,
            role: data.role,
            content: data.content,
            citations: data.citations,
            grounding: data.grounding,
            clientMessageId: data.clientMessageId,
            retryOfId: data.retryOfId,
        },
        select: messageSelect,
    });
}

function messageIdentity(messageId: string) {
    return [{ id: messageId }, { clientMessageId: messageId }];
}

export async function prepareChatUserMessage(input: {
    conversationId: string;
    clientMessageId: string;
    content: string;
    grounding: GroundingSnapshot;
    trigger: "submit-message" | "regenerate-message";
    targetMessageId?: string;
}) {
    return prisma.$transaction(async (transaction) => {
        if (input.trigger === "regenerate-message") {
            if (!input.targetMessageId) {
                throw new ValidationError("A message id is required to regenerate an answer");
            }
            const target = await transaction.message.findFirst({
                where: {
                    conversationId: input.conversationId,
                    role: "ASSISTANT",
                    supersededAt: null,
                    OR: messageIdentity(input.targetMessageId),
                },
                select: messageSelect,
            });
            if (!target) throw new ValidationError("The answer is unavailable for regeneration");
            const latestAssistant = await transaction.message.findFirst({
                where: {
                    conversationId: input.conversationId,
                    role: "ASSISTANT",
                    supersededAt: null,
                },
                orderBy: { createdAt: "desc" },
                select: { id: true },
            });
            if (latestAssistant?.id !== target.id) {
                throw new ValidationError("Only the latest answer can be regenerated");
            }

            const userMessage = await transaction.message.findFirst({
                where: {
                    conversationId: input.conversationId,
                    role: "USER",
                    supersededAt: null,
                    createdAt: { lte: target.createdAt },
                },
                orderBy: { createdAt: "desc" },
                select: messageSelect,
            });
            if (!userMessage) throw new ValidationError("The original question is unavailable");
            return {
                userMessage,
                retryOfId: target.id,
                pendingEdit: undefined,
            };
        }

        const existing = await transaction.message.findFirst({
            where: {
                conversationId: input.conversationId,
                role: "USER",
                OR: messageIdentity(input.clientMessageId),
            },
            select: messageSelect,
        });
        if (existing) {
            const pendingEdit = existing.content === input.content
                ? undefined
                : {
                      id: existing.id,
                      content: input.content,
                      grounding: input.grounding,
                  };
            return {
                userMessage: pendingEdit
                    ? {
                          ...existing,
                          content: pendingEdit.content,
                          grounding: pendingEdit.grounding,
                      }
                    : existing,
                retryOfId: undefined,
                pendingEdit,
            };
        }

        const userMessage = await transaction.message.upsert({
            where: {
                conversationId_clientMessageId: {
                    conversationId: input.conversationId,
                    clientMessageId: input.clientMessageId,
                },
            },
            create: {
                conversationId: input.conversationId,
                role: "USER",
                content: input.content,
                grounding: input.grounding,
                clientMessageId: input.clientMessageId,
            },
            update: {},
            select: messageSelect,
        });
        return {
            userMessage,
            retryOfId: undefined,
            pendingEdit: undefined,
        };
    });
}

export async function updateMessageFeedback(input: {
    conversationId: string;
    messageId: string;
    feedback: "HELPFUL" | "NOT_HELPFUL";
}) {
    const message = await prisma.message.findFirst({
        where: {
            conversationId: input.conversationId,
            role: "ASSISTANT",
            supersededAt: null,
            OR: messageIdentity(input.messageId),
        },
        select: { id: true },
    });
    if (!message) throw new ValidationError("The answer is unavailable");
    return prisma.message.update({
        where: { id: message.id },
        data: { feedback: input.feedback },
        select: messageSelect,
    });
}

type CitationSourceTarget = {
    id: string;
};

type CitationChunkTarget = {
    id: string;
    sourceId: string;
    index: number;
};

export function validateCitationTargets(
    citations: SourceCitation[],
    sources: CitationSourceTarget[],
    chunks: CitationChunkTarget[],
): void {
    const sourceIds = new Set(sources.map((source) => source.id));
    const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    for (const citation of citations) {
        if (!sourceIds.has(citation.sourceId)) {
            throw new ValidationError(`Citation ${citation.label} source is unavailable`);
        }
        if (!citation.chunkId || citation.chunkIndex === undefined) {
            throw new ValidationError(`Citation ${citation.label} has no exact chunk target`);
        }

        const chunk = chunksById.get(citation.chunkId);
        if (
            !chunk ||
            chunk.sourceId !== citation.sourceId ||
            chunk.index !== citation.chunkIndex
        ) {
            throw new ValidationError(`Citation ${citation.label} chunk is unavailable`);
        }
    }
}

export async function createAssistantMessageWithValidatedCitations(
    workspaceId: string,
    data: CreateMessageData & {
        citations: CitationEnvelope;
        generationLeaseId: string;
        pendingEdit?: PendingUserEdit;
    },
) {
    const citations = citationEnvelopeSchema.parse(data.citations);
    const sourceCitations = citations.items.filter(
        (citation): citation is SourceCitation => citation.kind === "source",
    );
    const sourceIds = [...new Set(sourceCitations.map((citation) => citation.sourceId))];
    const chunkIds = [
        ...new Set(
            sourceCitations.flatMap((citation) =>
                citation.chunkId ? [citation.chunkId] : [],
            ),
        ),
    ];

    return prisma.$transaction(async (transaction) => {
        const conversation = await transaction.conversation.findFirst({
            where: { id: data.conversationId, workspaceId },
            select: { id: true },
        });
        if (!conversation) {
            throw new ValidationError("Conversation is unavailable");
        }

        const sources = sourceIds.length
            ? await transaction.$queryRaw<CitationSourceTarget[]>(Prisma.sql`
                  SELECT "id"
                  FROM "source"
                  WHERE "workspaceId" = ${workspaceId}
                    AND "id" IN (${Prisma.join(sourceIds)})
                  FOR KEY SHARE
              `)
            : [];
        const chunks = chunkIds.length
            ? await transaction.$queryRaw<CitationChunkTarget[]>(Prisma.sql`
                  SELECT sc."id", sc."sourceId", sc."index"
                  FROM "source_chunk" sc
                  INNER JOIN "source" s ON s."id" = sc."sourceId"
                  WHERE s."workspaceId" = ${workspaceId}
                    AND sc."id" IN (${Prisma.join(chunkIds)})
                  FOR KEY SHARE OF sc
              `)
            : [];

        validateCitationTargets(sourceCitations, sources, chunks);

        if (data.pendingEdit) {
            const original = await transaction.message.findFirst({
                where: {
                    id: data.pendingEdit.id,
                    conversationId: data.conversationId,
                    role: "USER",
                    supersededAt: null,
                },
                select: { createdAt: true },
            });
            if (!original) throw new ConflictError("The conversation changed while editing");
            await transaction.message.updateMany({
                where: {
                    conversationId: data.conversationId,
                    createdAt: { gt: original.createdAt },
                    supersededAt: null,
                },
                data: { supersededAt: new Date() },
            });
            await transaction.message.update({
                where: { id: data.pendingEdit.id },
                data: {
                    content: data.pendingEdit.content,
                    grounding: data.pendingEdit.grounding,
                },
            });
        }

        if (data.retryOfId) {
            const claimed = await transaction.message.updateMany({
                where: {
                    id: data.retryOfId,
                    conversationId: data.conversationId,
                    role: "ASSISTANT",
                    supersededAt: null,
                },
                data: { supersededAt: new Date() },
            });
            if (claimed.count !== 1) {
                throw new ConflictError("This answer has already been regenerated");
            }
        }

        const released = await transaction.conversation.updateMany({
            where: {
                id: data.conversationId,
                generationLeaseId: data.generationLeaseId,
            },
            data: {
                generationLeaseId: null,
                generationLeaseExpiresAt: null,
                ...((data.pendingEdit || data.retryOfId)
                    ? {
                          summary: null,
                          summaryMessageCount: 0,
                          summarizedAt: null,
                          historyRevision: { increment: 1 },
                      }
                    : {}),
            },
        });
        if (released.count !== 1) {
            throw new ConflictError("The generation attempt is no longer active");
        }

        return transaction.message.create({
            data: {
                conversationId: data.conversationId,
                role: data.role,
                content: data.content,
                citations,
                grounding: data.grounding,
                clientMessageId: data.clientMessageId,
                retryOfId: data.retryOfId,
            },
            select: messageSelect,
        });
    });
}
