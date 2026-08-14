import { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";
import type {
    CitationEnvelope,
    GroundingSnapshot,
    SourceCitation,
} from "@homeworkcopy/contracts";
import { citationEnvelopeSchema } from "@homeworkcopy/contracts";
import { ValidationError } from "../types/app-error.js";

export const messageSelect = {
    id: true,
    conversationId: true,
    role: true,
    content: true,
    citations: true,
    grounding: true,
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
};

export function findMessagesByConversationId(conversationId: string) {
    return prisma.message.findMany({
        where: { conversationId },
        select: messageSelect,
        orderBy: { createdAt: "asc" },
    });
}

export function countMessagesByConversationId(conversationId: string) {
    return prisma.message.count({
        where: { conversationId },
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
        },
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
    data: CreateMessageData & { citations: CitationEnvelope },
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

        return transaction.message.create({
            data: {
                conversationId: data.conversationId,
                role: data.role,
                content: data.content,
                citations,
                grounding: data.grounding,
            },
            select: messageSelect,
        });
    });
}
