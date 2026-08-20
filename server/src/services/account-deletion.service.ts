/**
 * Deleting an account, in the order the stores require.
 *
 * The database goes **last**. Every other store is addressed by an identifier
 * that only the database knows — which Pinecone namespaces, which stored
 * objects, which export archives — so dropping the user row first would leave
 * every one of them orphaned, paid for, and unreachable. That ordering is the
 * single most important thing in this file.
 *
 * The second is that a failure does not stop the walk. If object storage is
 * having an outage, the vectors and the memories should still go, and the
 * account row should stay so a retry has something to walk again. The receipt
 * records which stores confirmed, so "is it gone?" has a real answer rather than
 * a hopeful one.
 *
 * Every step is idempotent. Deleting an object that is already gone is a no-op
 * in each provider used here, which is what makes retrying safe.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { clerkClient } from "@clerk/express";
import {
    DELETION_TARGETS,
    deletionStatusFromOutcomes,
    type DeletionOutcome,
    type DeletionReceipt,
    type DeletionStatus,
    type DeletionTarget,
} from "@homeworkcopy/contracts";
import prisma from "../lib/db.js";
import { isExportStorageConfigured } from "../lib/export-storage.js";
import { logger } from "../lib/logger.js";
import { privacyOperations } from "../lib/metrics.js";
import { deleteWorkspaceVectors } from "../lib/pinecone.js";
import {
    claimDeletionReceipt,
    findDeletionReceiptBySubject,
    openDeletionReceipt,
    settleDeletionReceipt,
    type DeletionReceiptRecord,
} from "../repositories/deletion-receipt.repository.js";
import { toPrismaJson } from "../utils/prisma-json.js";
import { NotFoundError } from "../types/app-error.js";
import {
    collectAccountStoredObjects,
    destroyStoredObjects,
} from "./stored-object.service.js";

/**
 * The subject key on a receipt.
 *
 * A hash rather than the id itself, because the receipt outlives the account:
 * enough to match a support request against a receipt, not enough to identify
 * anyone from the table alone.
 *
 * @param userId - The account being deleted
 * @returns Hex SHA-256 of the id
 */
export function deletionSubjectHash(userId: string): string {
    return createHash("sha256").update(userId).digest("hex");
}

/**
 * What deleting this account will destroy, shown before it is confirmed.
 *
 * Deleting an owned notebook also ends every collaborator's access to it, which
 * a reader has a right to know before rather than after.
 */
export type DeletionPreview = {
    notebooks: number;
    sharedNotebooks: number;
    collaboratorsLosingAccess: number;
    sources: number;
    conversations: number;
    outputs: number;
    notes: number;
    /** Notebooks reachable through someone else's sharing; untouched by this. */
    notebooksSharedWithYou: number;
};

/**
 * Counts what an account deletion would remove.
 *
 * @param userId - Account being previewed
 * @returns Counts for the confirmation screen
 */
export async function previewAccountDeletion(
    userId: string,
): Promise<DeletionPreview> {
    const owned = await prisma.workspace.findMany({
        where: { userId },
        select: {
            id: true,
            _count: {
                select: {
                    members: true,
                    sources: true,
                    conversations: true,
                    artifacts: true,
                    notes: true,
                },
            },
        },
    });

    const notebooksSharedWithYou = await prisma.notebookMember.count({
        where: { userId },
    });

    return {
        notebooks: owned.length,
        sharedNotebooks: owned.filter((notebook) => notebook._count.members > 0)
            .length,
        collaboratorsLosingAccess: owned.reduce(
            (total, notebook) => total + notebook._count.members,
            0,
        ),
        sources: owned.reduce(
            (total, notebook) => total + notebook._count.sources,
            0,
        ),
        conversations: owned.reduce(
            (total, notebook) => total + notebook._count.conversations,
            0,
        ),
        outputs: owned.reduce(
            (total, notebook) => total + notebook._count.artifacts,
            0,
        ),
        notes: owned.reduce((total, notebook) => total + notebook._count.notes, 0),
        notebooksSharedWithYou,
    };
}

/**
 * Shapes a receipt row for the API.
 *
 * @param record - Stored receipt
 * @returns The receipt in its contract shape
 */
export function toDeletionReceipt(
    record: DeletionReceiptRecord,
): DeletionReceipt {
    const outcomes = z
        .array(
            z.object({
                target: z.enum(DELETION_TARGETS),
                status: z.enum(["DELETED", "SKIPPED", "FAILED"]),
                removedCount: z.number().int().nonnegative().nullable(),
            }),
        )
        .safeParse(record.outcomes);

    return {
        id: record.id,
        status: record.status,
        outcomes: outcomes.success ? outcomes.data : [],
        requestedAt: record.requestedAt.toISOString(),
        completedAt:
            record.completedAt === null ? null : record.completedAt.toISOString(),
    };
}

/**
 * Records that a reader asked for their account to be deleted.
 *
 * The confirmation phrase is validated by the request schema before this runs,
 * so reaching here means the reader typed it.
 *
 * @param userId - Account to delete
 * @returns The open receipt
 */
export async function requestAccountDeletion(
    userId: string,
): Promise<DeletionReceipt> {
    const record = await openDeletionReceipt(deletionSubjectHash(userId));
    privacyOperations.inc({ operation: "deletion", outcome: "requested" });
    logger.info(
        { subjectHash: record.subjectHash },
        "account deletion requested",
    );
    return toDeletionReceipt(record);
}

/**
 * Reads the receipt for an account's deletion.
 *
 * @param userId - Account in question
 * @returns The receipt
 * @throws {NotFoundError} When no deletion was ever requested
 */
export async function getDeletionReceipt(
    userId: string,
): Promise<DeletionReceipt> {
    const record = await findDeletionReceiptBySubject(
        deletionSubjectHash(userId),
    );
    if (record === null) throw new NotFoundError("No deletion request found");
    return toDeletionReceipt(record);
}

/**
 * Runs one deletion target and turns any failure into an outcome.
 *
 * A store that refuses must not abort the walk: the remaining stores can still
 * be cleared, and what matters is that the receipt records honestly which one
 * did not.
 *
 * @param target - Store being cleared
 * @param run - The clearing itself, returning how many things it removed
 * @returns What happened
 */
async function runTarget(
    target: DeletionTarget,
    run: () => Promise<number | null>,
): Promise<DeletionOutcome> {
    try {
        const removedCount = await run();
        return { target, status: "DELETED", removedCount };
    } catch (error) {
        logger.error({ error, target }, "account deletion target failed");
        return { target, status: "FAILED", removedCount: null };
    }
}

/**
 * Clears the vector index for every notebook the account owns.
 *
 * @param userId - Account being deleted
 * @returns How many namespaces were cleared
 */
async function clearVectorIndex(userId: string): Promise<number> {
    if (!process.env.PINECONE_API_KEY?.trim()) return 0;

    const workspaces = await prisma.workspace.findMany({
        where: { userId },
        select: { id: true },
    });

    for (const workspace of workspaces) {
        await deleteWorkspaceVectors(workspace.id);
    }

    return workspaces.length;
}

/**
 * Destroys every stored object the account owns.
 *
 * One failing object fails the whole target rather than being skipped: a
 * partially cleared storage bucket reported as `DELETED` would be a lie, and the
 * retry is cheap because destroying an already-gone object is a no-op.
 *
 * @param userId - Account being deleted
 * @returns How many objects were destroyed
 */
async function clearObjectStorage(userId: string): Promise<number> {
    if (!isExportStorageConfigured() && !process.env.CLOUDINARY_CLOUD_NAME) {
        return 0;
    }

    const objects = await collectAccountStoredObjects(userId);
    const result = await destroyStoredObjects(objects);

    if (result.failed > 0) {
        throw new Error(
            `${result.failed} stored object(s) could not be deleted`,
        );
    }

    return result.destroyed;
}

/**
 * Removes every memory the provider learned about this account.
 *
 * Imported lazily so a deployment with no memory provider does not pay for the
 * client at module load, and so this file has no hard dependency on it.
 *
 * @param userId - Account being deleted
 * @returns How many memories were removed
 */
async function clearLearnedMemory(userId: string): Promise<number> {
    if (!process.env.MEM0_API_KEY?.trim()) return 0;

    const { deleteAllUserMemories } = await import("../lib/mem0.js");
    return deleteAllUserMemories(userId);
}

/**
 * Removes the sign-in identity.
 *
 * Done before the database row so a failure here leaves an account that can
 * still sign in and see that its deletion is incomplete, rather than a live
 * Clerk identity pointing at nothing.
 *
 * @param clerkUserId - The account's external identity, if it has one
 * @returns One when an identity was removed, zero when there was none
 */
async function clearIdentity(clerkUserId: string | null): Promise<number> {
    if (clerkUserId === null) return 0;

    try {
        await clerkClient.users.deleteUser(clerkUserId);
        return 1;
    } catch (error) {
        // An identity that is already gone — deleted from the Clerk dashboard,
        // or by a webhook that arrived first — is the outcome we wanted.
        const notFound =
            error instanceof Error && /not found|404/i.test(error.message);
        if (notFound) return 0;
        throw error;
    }
}

/**
 * Deletes the account row, and with it everything that cascades from it.
 *
 * @param userId - Account being deleted
 * @returns One when a row was deleted, zero when it was already gone
 */
async function clearDatabase(userId: string): Promise<number> {
    const deleted = await prisma.user.deleteMany({ where: { id: userId } });
    return deleted.count;
}

/**
 * Carries out a requested deletion.
 *
 * Called by the job runner. Safe to call again after a partial failure: every
 * target is idempotent, and the receipt's status guard keeps two attempts from
 * walking concurrently.
 *
 * @param userId - Account to delete
 * @returns The settled receipt status
 */
export async function processAccountDeletion(
    userId: string,
): Promise<{ status: DeletionStatus }> {
    const subjectHash = deletionSubjectHash(userId);
    const claimed = await claimDeletionReceipt(subjectHash);

    if (claimed === null) {
        // Already completed, or another attempt holds it.
        const existing = await findDeletionReceiptBySubject(subjectHash);
        return { status: existing?.status ?? "COMPLETED" };
    }

    const account = await prisma.user.findUnique({
        where: { id: userId },
        select: { clerkUserId: true },
    });

    if (account === null) {
        // The row is already gone, so every store keyed off it is unreachable
        // and there is nothing left to walk. Recording it as complete is the
        // honest answer rather than leaving a receipt open forever.
        const settled = await settleDeletionReceipt({
            subjectHash,
            status: "COMPLETED",
            outcomes: toPrismaJson(
                DELETION_TARGETS.map((target) => ({
                    target,
                    status: "SKIPPED",
                    removedCount: null,
                })),
            ),
        });
        return { status: settled.status };
    }

    // Order is load-bearing: everything addressed by a database identifier is
    // cleared before the identifiers are.
    const outcomes: DeletionOutcome[] = [
        await runTarget("vectorIndex", () => clearVectorIndex(userId)),
        await runTarget("objectStorage", () => clearObjectStorage(userId)),
        await runTarget("learnedMemory", () => clearLearnedMemory(userId)),
        await runTarget("identityProvider", () =>
            clearIdentity(account.clerkUserId),
        ),
    ];

    const externalFailed = outcomes.some(
        (outcome) => outcome.status === "FAILED",
    );

    // The account row is what a retry needs to find the external identifiers
    // again, so it survives until every external store has confirmed.
    outcomes.push(
        externalFailed
            ? {
                  target: "database",
                  status: "FAILED",
                  removedCount: null,
              }
            : await runTarget("database", () => clearDatabase(userId)),
    );

    const status = deletionStatusFromOutcomes(outcomes);
    await settleDeletionReceipt({
        subjectHash,
        status,
        outcomes: toPrismaJson(outcomes),
    });

    privacyOperations.inc({
        operation: "deletion",
        outcome: status === "COMPLETED" ? "success" : "incomplete",
    });
    logger.info({ subjectHash, status, outcomes }, "account deletion settled");

    if (status !== "COMPLETED") {
        // Thrown so the job runner retries the walk rather than reporting a
        // successful run over an incomplete deletion.
        throw new Error("Account deletion incomplete: one or more stores failed");
    }

    return { status };
}
