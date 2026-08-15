import { Prisma } from "../generated/prisma/client.js";
import {
    NOTEBOOK_PROCESSING_MAX,
    NOTEBOOK_SOURCE_MAX,
} from "@homeworkcopy/contracts";
import prisma from "../lib/db.js";
import { ConflictError } from "../types/app-error.js";
import type { ListSourcesQuery } from "../validators/source.validator.js";

export const sourceSelect = {
    id: true,
    workspaceId: true,
    type: true,
    title: true,
    content: true,
    url: true,
    status: true,
    processingStage: true,
    processingVersion: true,
    contentChecksum: true,
    metadata: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type SourceRecord = Prisma.SourceGetPayload<{
    select: typeof sourceSelect;
}>;

export type CreateSourceData = {
    workspaceId: string;
    type: SourceRecord["type"];
    title: string;
    content?: string | null;
    url?: string | null;
    status?: SourceRecord["status"];
    processingStage?: SourceRecord["processingStage"];
    processingVersion?: number;
    contentChecksum?: string | null;
    idempotencyKey?: string | null;
    metadata?: Prisma.InputJsonValue;
};

export function findSourcesByWorkspaceId(
    workspaceId: string,
    filters: ListSourcesQuery = {},
) {
    const where: Prisma.SourceWhereInput = { workspaceId };

    if (filters.type) {
        where.type = filters.type;
    }

    if (filters.status) {
        where.status = filters.status;
    }

    if (filters.q) {
        where.OR = [
            { title: { contains: filters.q, mode: "insensitive" } },
            { content: { contains: filters.q, mode: "insensitive" } },
        ];
    }

    return prisma.source.findMany({
        where,
        select: sourceSelect,
        orderBy: { createdAt: "desc" },
    });
}

export function findSourceByIdAndWorkspaceId(
    sourceId: string,
    workspaceId: string,
) {
    return prisma.source.findFirst({
        where: { id: sourceId, workspaceId },
        select: sourceSelect,
    });
}

export function findSourcesByIdsAndWorkspaceId(
    sourceIds: string[],
    workspaceId: string,
) {
    return prisma.source.findMany({
        where: {
            id: { in: sourceIds },
            workspaceId,
        },
        select: sourceSelect,
    });
}

export function findExistingSourceIds(
    workspaceId: string,
    sourceIds: string[],
) {
    return prisma.source.findMany({
        where: { workspaceId, id: { in: sourceIds } },
        select: { id: true },
    });
}

export function createSourceRecord(data: CreateSourceData) {
    return prisma.$transaction(async (transaction) => {
        await transaction.$executeRaw(
            Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${data.workspaceId}, 0))`,
        );
        const sourceCount = await transaction.source.count({
            where: { workspaceId: data.workspaceId, status: { not: "DELETING" } },
        });
        if (sourceCount >= NOTEBOOK_SOURCE_MAX) {
            throw new ConflictError(
                `This notebook has reached its ${NOTEBOOK_SOURCE_MAX}-source limit`,
            );
        }
        const processingCount = await transaction.source.count({
            where: { workspaceId: data.workspaceId, status: "PROCESSING" },
        });
        if (processingCount >= NOTEBOOK_PROCESSING_MAX) {
            throw new ConflictError(
                `Wait for one of the ${NOTEBOOK_PROCESSING_MAX} active imports to finish before adding more`,
            );
        }

        return transaction.source.create({
            data: {
                workspaceId: data.workspaceId,
                type: data.type,
                title: data.title,
                content: data.content ?? null,
                url: data.url ?? null,
                status: data.status ?? "PENDING",
                processingStage: data.processingStage ?? "QUEUED",
                processingVersion: data.processingVersion ?? 1,
                contentChecksum: data.contentChecksum ?? null,
                idempotencyKey: data.idempotencyKey ?? null,
                metadata: data.metadata,
            },
            select: sourceSelect,
        });
    });
}

export function findSourceById(sourceId: string) {
    return prisma.source.findUnique({
        where: { id: sourceId },
        select: sourceSelect,
    });
}

export function findSourceByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string,
) {
    return prisma.source.findUnique({
        where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
        select: sourceSelect,
    });
}

export function findSourceByChecksum(workspaceId: string, contentChecksum: string) {
    return prisma.source.findUnique({
        where: { workspaceId_contentChecksum: { workspaceId, contentChecksum } },
        select: sourceSelect,
    });
}

export function countSourcesByWorkspaceId(workspaceId: string) {
    return prisma.source.count({ where: { workspaceId, status: { not: "DELETING" } } });
}

export function countProcessingSourcesByWorkspaceId(workspaceId: string) {
    return prisma.source.count({
        where: { workspaceId, status: "PROCESSING" },
    });
}

export function updateSourceRecord(
    sourceId: string,
    data: {
        content?: string | null;
        status?: SourceRecord["status"];
        processingStage?: SourceRecord["processingStage"];
        processingVersion?: number;
        contentChecksum?: string | null;
        metadata?: Prisma.InputJsonValue;
    },
) {
    return prisma.source.update({
        where: { id: sourceId },
        data,
        select: sourceSelect,
    });
}

export function updateSourceForProcessingVersion(
    sourceId: string,
    processingVersion: number,
    data: {
        content?: string | null;
        status?: SourceRecord["status"];
        processingStage?: SourceRecord["processingStage"];
        metadata?: Prisma.InputJsonValue;
    },
) {
    return prisma.source.updateMany({
        where: { id: sourceId, processingVersion, status: { not: "DELETING" } },
        data,
    });
}

export function beginSourceReprocessing(sourceId: string) {
    return prisma.source.update({
        where: { id: sourceId },
        data: {
            status: "PENDING",
            processingStage: "QUEUED",
            processingVersion: { increment: 1 },
        },
        select: sourceSelect,
    });
}

export async function deleteSourceRecord(sourceId: string) {
    await prisma.source.deleteMany({ where: { id: sourceId } });
}
