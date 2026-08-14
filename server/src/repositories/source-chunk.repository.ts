import { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const sourceChunkSelect = {
    id: true,
    sourceId: true,
    index: true,
    content: true,
    tokenCount: true,
    metadata: true,
    createdAt: true,
} as const;

export type SourceChunkRecord = Prisma.SourceChunkGetPayload<{
    select: typeof sourceChunkSelect;
}>;

export type CreateSourceChunkData = {
    sourceId: string;
    index: number;
    content: string;
    tokenCount?: number | null;
    metadata?: Prisma.InputJsonValue;
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
            sourceId: chunk.sourceId,
            index: chunk.index,
            content: chunk.content,
            tokenCount: chunk.tokenCount ?? null,
            metadata: chunk.metadata,
        })),
        select: sourceChunkSelect,
    });
}

export function findChunksBySourceId(sourceId: string) {
    return prisma.sourceChunk.findMany({
        where: { sourceId },
        select: sourceChunkSelect,
        orderBy: { index: "asc" },
    });
}

export type KeywordChunkRecord = {
    chunkId: string;
    sourceId: string;
    chunkIndex: number;
    text: string;
    sourceTitle: string;
    sourceType: string;
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
