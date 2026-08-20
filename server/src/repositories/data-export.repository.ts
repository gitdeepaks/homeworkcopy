import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const dataExportSelect = {
    id: true,
    userId: true,
    scope: true,
    workspaceId: true,
    status: true,
    failureCode: true,
    manifest: true,
    storagePublicId: true,
    bytes: true,
    expiresAt: true,
    completedAt: true,
    createdAt: true,
} as const;

export type DataExportRecord = Prisma.DataExportGetPayload<{
    select: typeof dataExportSelect;
}>;

export type CreateDataExportData = {
    userId: string;
    scope: DataExportRecord["scope"];
    workspaceId: string | null;
};

/**
 * Records a new export request.
 *
 * @param data - Requesting user and what the export covers
 * @returns The stored row
 */
export function createDataExportRecord(data: CreateDataExportData) {
    return prisma.dataExport.create({ data, select: dataExportSelect });
}

/**
 * Reads one export belonging to a user.
 *
 * Scoped by `userId` in the query rather than checked afterwards, so a wrong id
 * is a miss rather than a leak.
 *
 * @param exportId - Export to read
 * @param userId - Owner of the export
 * @returns The row, or `null`
 */
export function findDataExportByIdAndUserId(
    exportId: string,
    userId: string,
) {
    return prisma.dataExport.findFirst({
        where: { id: exportId, userId },
        select: dataExportSelect,
    });
}

/**
 * Reads a user's export history, newest first.
 *
 * @param userId - Owner of the exports
 * @param limit - Maximum rows to return
 * @returns The rows
 */
export function findDataExportsByUserId(userId: string, limit: number) {
    return prisma.dataExport.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: dataExportSelect,
    });
}

/**
 * Counts a user's recent export requests, for rate limiting by cost rather than
 * by request rate: building an archive is expensive enough that the limit has to
 * outlive a single rate-limit window.
 *
 * @param userId - Owner of the exports
 * @param since - Start of the window
 * @returns How many were requested in the window
 */
export function countDataExportsSince(userId: string, since: Date) {
    return prisma.dataExport.count({
        where: { userId, createdAt: { gte: since } },
    });
}

/**
 * How long a `PROCESSING` export may sit untouched before it is assumed dead.
 *
 * Comfortably longer than any real build. Without this, a worker killed
 * mid-archive — an out-of-memory kill, a node replaced under a rolling deploy —
 * leaves a row nothing will ever claim again, and the reader watches a spinner
 * that will never resolve.
 */
const STALE_PROCESSING_MS = 30 * 60 * 1000;

/**
 * Claims an export for processing.
 *
 * The status guard makes a duplicate job delivery a no-op rather than a second
 * archive, which matters because job runners retry. A row already marked
 * `FAILED` is deliberately not reclaimed: the failure is recorded and the reader
 * has been told, so a retry would only burn the work again to reach the same
 * answer. What *is* reclaimable is a `PROCESSING` row that has gone stale, which
 * means the previous attempt died rather than finished.
 *
 * @param exportId - Export to claim
 * @returns The claimed row, or `null` when another attempt holds it or it is
 * already settled
 */
export async function claimDataExport(exportId: string) {
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);

    const claimed = await prisma.dataExport.updateMany({
        where: {
            id: exportId,
            OR: [
                { status: "PENDING" },
                { status: "PROCESSING", updatedAt: { lt: staleBefore } },
            ],
        },
        data: { status: "PROCESSING" },
    });

    if (claimed.count === 0) return null;

    return prisma.dataExport.findUnique({
        where: { id: exportId },
        select: dataExportSelect,
    });
}

/**
 * Marks an export ready and records where the archive is.
 *
 * @param input - Export id, manifest, storage id, size, and expiry
 * @returns The updated row
 */
export function completeDataExport(input: {
    exportId: string;
    manifest: Prisma.InputJsonValue;
    storagePublicId: string;
    bytes: number;
    expiresAt: Date;
}) {
    return prisma.dataExport.update({
        where: { id: input.exportId },
        data: {
            status: "READY",
            manifest: input.manifest,
            storagePublicId: input.storagePublicId,
            bytes: input.bytes,
            expiresAt: input.expiresAt,
            completedAt: new Date(),
            failureCode: null,
        },
        select: dataExportSelect,
    });
}

/**
 * Marks an export failed with a machine-readable code.
 *
 * @param exportId - Export that failed
 * @param failureCode - One of the contract failure codes
 * @returns The updated row
 */
export function failDataExport(exportId: string, failureCode: string) {
    return prisma.dataExport.update({
        where: { id: exportId },
        data: { status: "FAILED", failureCode, completedAt: new Date() },
        select: dataExportSelect,
    });
}

/**
 * Finds ready exports whose archive has aged out.
 *
 * @param now - Current time
 * @param limit - Maximum rows to return in one pass
 * @returns Rows whose stored object should be deleted
 */
export function findExpiredDataExports(now: Date, limit: number) {
    return prisma.dataExport.findMany({
        where: { status: "READY", expiresAt: { lte: now } },
        take: limit,
        select: dataExportSelect,
    });
}

/**
 * Marks an export expired once its stored object is gone.
 *
 * The row survives its archive so the settings page can say "that export
 * expired" rather than showing nothing where a download used to be.
 *
 * @param exportId - Export whose archive was deleted
 * @returns The updated row
 */
export function markDataExportExpired(exportId: string) {
    return prisma.dataExport.update({
        where: { id: exportId },
        data: { status: "EXPIRED", storagePublicId: null },
        select: dataExportSelect,
    });
}

/**
 * Deletes export rows older than a cutoff.
 *
 * @param cutoff - Rows created before this are removed
 * @returns How many rows were deleted
 */
export async function deleteDataExportsBefore(cutoff: Date) {
    const result = await prisma.dataExport.deleteMany({
        where: {
            createdAt: { lt: cutoff },
            status: { in: ["EXPIRED", "FAILED"] },
        },
    });
    return result.count;
}
