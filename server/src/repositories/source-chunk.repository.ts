import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";
import { buildKeywordTsQuery } from "../lib/rag/keyword-query.js";

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

/**
 * Shape of one keyword-search row as it comes back from Postgres.
 *
 * Parsed rather than asserted through `$queryRaw`'s type parameter: the raw
 * query bypasses Prisma's generated types entirely, so the parameter would be a
 * promise the compiler cannot check. Validating here means a column rename or a
 * driver returning a bigint fails loudly at the boundary instead of surfacing as
 * a citation with a missing title several layers up.
 */
const keywordChunkRowSchema = z.object({
    chunkId: z.string().min(1),
    sourceId: z.string().min(1),
    chunkIndex: z.number().int().nonnegative(),
    text: z.string(),
    sourceTitle: z.string(),
    sourceType: z.string().min(1),
    // `metadata->>'timestamp'` is absent on every non-timed source.
    timestamp: z.number().finite().nullable(),
    score: z.number().finite(),
});

type KeywordChunkRow = z.infer<typeof keywordChunkRowSchema>;

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

/**
 * Narrows a nullable SQL timestamp to the optional property callers expect, so
 * a timed source and an untimed one differ by the key's presence rather than by
 * a null the consumer has to re-check.
 */
function toKeywordChunkRecord(row: KeywordChunkRow): KeywordChunkRecord {
    const { timestamp, ...rest } = row;
    return timestamp === null ? rest : { ...rest, timestamp };
}

/**
 * Finds chunks in the selected sources whose text matches any term of a question.
 *
 * Searches under two text-search configurations at once. `english` contributes
 * stemming, so "patterns" still finds "pattern". `simple` neither stems nor
 * strips stopwords, which is what lets a Devanagari, Han, or Cyrillic source
 * match at all — `to_tsvector('english', …)` treats those scripts as opaque
 * words and drops anything the English stopword list happens to collide with.
 * A chunk qualifies on either configuration and is ranked by whichever scored it
 * higher.
 *
 * @param workspaceId - Workspace whose sources may be searched
 * @param sourceIds - The reader's selected sources; an empty list matches nothing
 * @param query - The reader's question, in any script
 * @param limit - Maximum rows to return
 * @returns Matching chunks ordered by descending rank
 */
export async function searchReadyChunksByKeyword(
    workspaceId: string,
    sourceIds: string[],
    query: string,
    limit: number,
): Promise<KeywordChunkRecord[]> {
    const tsQuery = buildKeywordTsQuery(query);
    if (sourceIds.length === 0 || tsQuery.length === 0) {
        return [];
    }

    const rows = await prisma.$queryRaw(Prisma.sql`
        SELECT
            sc."id" AS "chunkId",
            sc."sourceId" AS "sourceId",
            sc."index" AS "chunkIndex",
            sc."content" AS "text",
            s."title" AS "sourceTitle",
            s."type"::text AS "sourceType",
            (sc."metadata"->>'timestamp')::double precision AS "timestamp",
            GREATEST(
                ts_rank_cd(
                    to_tsvector('english', sc."content"),
                    websearch_to_tsquery('english', ${tsQuery})
                ),
                ts_rank_cd(
                    to_tsvector('simple', sc."content"),
                    websearch_to_tsquery('simple', ${tsQuery})
                )
            )::double precision AS "score"
        FROM "source_chunk" sc
        INNER JOIN "source" s ON s."id" = sc."sourceId"
        WHERE s."workspaceId" = ${workspaceId}
          AND s."status" = 'READY'
          AND s."id" IN (${Prisma.join(sourceIds)})
          AND (
              to_tsvector('english', sc."content")
                  @@ websearch_to_tsquery('english', ${tsQuery})
              OR to_tsvector('simple', sc."content")
                  @@ websearch_to_tsquery('simple', ${tsQuery})
          )
        ORDER BY "score" DESC
        LIMIT ${limit}
    `);

    return keywordChunkRowSchema
        .array()
        .parse(rows)
        .map(toKeywordChunkRecord);
}
