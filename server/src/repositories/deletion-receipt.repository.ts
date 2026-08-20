import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const deletionReceiptSelect = {
    id: true,
    subjectHash: true,
    status: true,
    outcomes: true,
    requestedAt: true,
    completedAt: true,
} as const;

export type DeletionReceiptRecord = Prisma.DeletionReceiptGetPayload<{
    select: typeof deletionReceiptSelect;
}>;

/**
 * Opens a receipt, or returns the one already open for this subject.
 *
 * Upsert rather than create, so a reader who submits the form twice gets one
 * deletion rather than two racing ones — and so a retry after a partial failure
 * continues the same receipt instead of starting a second story about the same
 * account.
 *
 * @param subjectHash - SHA-256 of the user id being deleted
 * @returns The receipt row
 */
export function openDeletionReceipt(subjectHash: string) {
    return prisma.deletionReceipt.upsert({
        where: { subjectHash },
        create: { subjectHash, status: "PENDING" },
        update: {},
        select: deletionReceiptSelect,
    });
}

/**
 * Reads a receipt by subject.
 *
 * @param subjectHash - SHA-256 of the user id
 * @returns The receipt, or `null`
 */
export function findDeletionReceiptBySubject(subjectHash: string) {
    return prisma.deletionReceipt.findUnique({
        where: { subjectHash },
        select: deletionReceiptSelect,
    });
}

/**
 * How long a `PROCESSING` receipt may sit untouched before it is assumed dead.
 *
 * A deletion that stops halfway because its worker was killed must be
 * reclaimable, or someone's deletion request stalls forever with no signal that
 * anything is wrong. Every target is idempotent, so resuming is safe.
 */
const STALE_PROCESSING_MS = 30 * 60 * 1000;

/**
 * Marks a receipt as being worked on.
 *
 * The status guard keeps a duplicate job delivery from running the walk twice
 * concurrently. `INCOMPLETE` is claimable because that is precisely the state a
 * retry exists to resolve, and a stale `PROCESSING` row is claimable because it
 * means the previous attempt died rather than finished.
 *
 * @param subjectHash - SHA-256 of the user id
 * @returns The claimed receipt, or `null` when another attempt holds it or it is
 * already complete
 */
export async function claimDeletionReceipt(subjectHash: string) {
    const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);

    const claimed = await prisma.deletionReceipt.updateMany({
        where: {
            subjectHash,
            OR: [
                { status: { in: ["PENDING", "INCOMPLETE"] } },
                { status: "PROCESSING", updatedAt: { lt: staleBefore } },
            ],
        },
        data: { status: "PROCESSING" },
    });

    if (claimed.count === 0) return null;

    return prisma.deletionReceipt.findUnique({
        where: { subjectHash },
        select: deletionReceiptSelect,
    });
}

/**
 * Records the result of the deletion walk.
 *
 * @param input - Subject, final status, and per-store outcomes
 * @returns The updated receipt
 */
export function settleDeletionReceipt(input: {
    subjectHash: string;
    status: DeletionReceiptRecord["status"];
    outcomes: Prisma.InputJsonValue;
}) {
    return prisma.deletionReceipt.update({
        where: { subjectHash: input.subjectHash },
        data: {
            status: input.status,
            outcomes: input.outcomes,
            completedAt: input.status === "COMPLETED" ? new Date() : null,
        },
        select: deletionReceiptSelect,
    });
}
