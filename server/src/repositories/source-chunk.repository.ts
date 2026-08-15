import { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const sourceChunkSelect = {
    id: true,
    sourceId: true,
    index: true,
    content: true,
    tokenCount: true,
    metadata: true,
    processingVersion: true,
    createdAt: true,
} as const;

export type SourceChunkRecord = Prisma.SourceChunkGetPayload<{
    select: typeof sourceChunkSelect;
}>;

export type CreateSourceChunkData = {
    id: string;
    sourceId: string;
    index: number;
    content: string;
    tokenCount?: number | null;
    metadata?: Prisma.InputJsonValue;
    processingVersion: number;
};

export function deleteChunksBySourceId(sourceId: string) {
    return prisma.sourceChunk.deleteMany({
        where: { sourceId },
    });
}

export function createSourceChunks(chunks: CreateSourceChunkData[]) {
    if (chunks.length === 0) {
        return Promise.resolve([]);
    }

    return prisma.sourceChunk.createManyAndReturn({
        data: chunks.map((chunk) => ({
            id: chunk.id,
            sourceId: chunk.sourceId,
            index: chunk.index,
            content: chunk.content,
            tokenCount: chunk.tokenCount ?? null,
            metadata: chunk.metadata,
            processingVersion: chunk.processingVersion,
        })),
        select: sourceChunkSelect,
    });
}

export function replaceSourceChunksForProcessingVersion(
    sourceId: string,
    processingVersion: number,
    chunks: CreateSourceChunkData[],
) {
    return prisma.$transaction(async (transaction) => {
        const activeSource = await transaction.source.updateMany({
            where: {
                id: sourceId,
                processingVersion,
                status: "PROCESSING",
            },
            data: { processingStage: "CHUNKING" },
        });
        if (activeSource.count === 0) {
            throw new Error("Stale source processing job");
        }

        await transaction.sourceChunk.deleteMany({ where: { sourceId } });
        return transaction.sourceChunk.createManyAndReturn({
            data: chunks.map((chunk) => ({
                id: chunk.id,
                sourceId: chunk.sourceId,
                index: chunk.index,
                content: chunk.content,
                tokenCount: chunk.tokenCount ?? null,
                metadata: chunk.metadata,
                processingVersion: chunk.processingVersion,
            })),
            select: sourceChunkSelect,
        });
    });
}

export function findChunksBySourceId(sourceId: string) {
    return prisma.sourceChunk.findMany({
        where: { sourceId },
        select: sourceChunkSelect,
        orderBy: { index: "asc" },
    });
}

export function findChunksBySourceIdAndProcessingVersion(
    sourceId: string,
    processingVersion: number,
) {
    return prisma.sourceChunk.findMany({
        where: { sourceId, processingVersion },
        select: sourceChunkSelect,
        orderBy: { index: "asc" },
    });
}

export function findExistingChunkIds(
    workspaceId: string,
    chunkIds: string[],
) {
    return prisma.sourceChunk.findMany({
        where: {
            id: { in: chunkIds },
            source: { workspaceId },
        },
        select: { id: true },
    });
}

export type KeywordChunkRecord = {
    chunkId: string;
    sourceId: string;
    chunkIndex: number;
    text: string;
    sourceTitle: string;
    sourceType: string;
    timestamp?: number;
    score: number;
};

export function searchReadyChunksByKeyword(
    workspaceId: string,
    sourceIds: string[],
    query: string,
    limit: number,
) {
    if (sourceIds.length === 0 || query.trim().length === 0) {
        return Promise.resolve<KeywordChunkRecord[]>([]);
    }

    return prisma.$queryRaw<KeywordChunkRecord[]>(Prisma.sql`
        SELECT
            sc."id" AS "chunkId",
            sc."sourceId" AS "sourceId",
            sc."index" AS "chunkIndex",
            sc."content" AS "text",
            s."title" AS "sourceTitle",
            s."type"::text AS "sourceType",
            (sc."metadata"->>'timestamp')::double precision AS "timestamp",
            ts_rank_cd(
                to_tsvector('english', sc."content"),
                websearch_to_tsquery('english', ${query})
            )::double precision AS "score"
        FROM "source_chunk" sc
        INNER JOIN "source" s ON s."id" = sc."sourceId"
        WHERE s."workspaceId" = ${workspaceId}
          AND s."status" = 'READY'
          AND s."id" IN (${Prisma.join(sourceIds)})
          AND to_tsvector('english', sc."content")
              @@ websearch_to_tsquery('english', ${query})
        ORDER BY "score" DESC
        LIMIT ${limit}
    `);
}
