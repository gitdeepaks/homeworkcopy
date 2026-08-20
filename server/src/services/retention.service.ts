/**
 * Data that nobody will ever remember to delete.
 *
 * Everything a reader deletes goes immediately. This is the other half of a
 * retention policy: the rows that accumulate because they are nobody's — webhook
 * receipts, usage counters, resolved invitations, failed outputs. Left alone,
 * they turn "we hold your data for as long as you have an account" into a claim
 * that is not true, and turn a breach into a much larger one.
 *
 * The policy lives in `RETENTION_POLICY` in the contracts package, and both the
 * published disclosure and this job read it. There is no second copy of the
 * numbers, so the page cannot come to disagree with what actually runs.
 *
 * Every pass is bounded and independent. A purge that fails for one resource
 * does not stop the others, because the alternative is one bad table freezing
 * the whole policy.
 */

import {
    RETAINED_RESOURCES,
    retentionCutoff,
    type RetainedResource,
} from "@homeworkcopy/contracts";
import prisma from "../lib/db.js";
import { deleteExportObject } from "../lib/export-storage.js";
import { logger } from "../lib/logger.js";
import { retentionPurged } from "../lib/metrics.js";
import {
    deleteDataExportsBefore,
    findExpiredDataExports,
    markDataExportExpired,
} from "../repositories/data-export.repository.js";

/**
 * How many expired archives one run will destroy.
 *
 * Bounded because each one is a network call to a storage provider, and a run
 * that tries to make ten thousand of them in a row is a run that gets killed
 * halfway with no record of where it stopped. The job runs daily; a backlog
 * drains over a few days rather than in one heroic pass.
 */
const EXPIRED_EXPORT_BATCH = 200;

/** What one resource's purge did. */
export type RetentionOutcome = {
    resource: RetainedResource;
    /** `null` when the resource is retained indefinitely and nothing was tried. */
    removed: number | null;
    failed: boolean;
};

/**
 * Purges rows of one class older than its retention window.
 *
 * @param resource - Class being purged
 * @param now - Current time
 * @returns How many rows were removed
 */
async function purgeResource(
    resource: RetainedResource,
    now: Date,
): Promise<number | null> {
    const cutoff = retentionCutoff(resource, now);
    if (cutoff === null) return null;

    switch (resource) {
        case "auditEvent": {
            const result = await prisma.auditEvent.deleteMany({
                where: { createdAt: { lt: cutoff } },
            });
            return result.count;
        }
        case "chatUsage": {
            const result = await prisma.chatUsage.deleteMany({
                where: { periodStart: { lt: cutoff } },
            });
            return result.count;
        }
        case "clerkWebhookEvent": {
            const result = await prisma.clerkWebhookEvent.deleteMany({
                where: { receivedAt: { lt: cutoff } },
            });
            return result.count;
        }
        case "failedOutput": {
            const result = await prisma.learningArtifact.deleteMany({
                where: { status: "FAILED", updatedAt: { lt: cutoff } },
            });
            return result.count;
        }
        case "resolvedInvitation": {
            const result = await prisma.notebookInvitation.deleteMany({
                where: {
                    status: { in: ["ACCEPTED", "REVOKED"] },
                    updatedAt: { lt: cutoff },
                },
            });
            return result.count;
        }
        case "expiredShareLink": {
            const result = await prisma.notebookShareLink.deleteMany({
                where: {
                    OR: [
                        { revokedAt: { lt: cutoff } },
                        { expiresAt: { lt: cutoff } },
                    ],
                },
            });
            return result.count;
        }
        case "dataExport":
            return purgeExports(now, cutoff);
        case "deletionReceipt":
            // Retained indefinitely; `retentionCutoff` already returned null and
            // this branch is unreachable. Listed so a new resource added to the
            // enum fails this switch at compile time rather than being skipped.
            return null;
    }
}

/**
 * Destroys aged-out export archives, then removes the rows once the bytes are
 * gone.
 *
 * The two steps are ordered and separate on purpose. Deleting the row first
 * would strand the archive: the storage id lives only on the row, so nothing
 * would ever find it again. Marking the row `EXPIRED` rather than deleting it
 * immediately lets the settings page say "that export expired" instead of
 * showing an empty space where a download used to be.
 *
 * @param now - Current time
 * @param cutoff - Rows older than this are removed entirely
 * @returns How many archives and rows were cleared
 */
async function purgeExports(now: Date, cutoff: Date): Promise<number> {
    const expired = await findExpiredDataExports(now, EXPIRED_EXPORT_BATCH);
    let cleared = 0;

    for (const record of expired) {
        if (record.storagePublicId !== null) {
            try {
                await deleteExportObject(record.storagePublicId);
            } catch (error) {
                // Leave the row as READY so the next run tries again rather than
                // marking it expired over an archive that is still sitting there.
                logger.error(
                    { error, exportId: record.id },
                    "expired export object delete failed",
                );
                continue;
            }
        }
        await markDataExportExpired(record.id);
        cleared += 1;
    }

    return cleared + (await deleteDataExportsBefore(cutoff));
}

/**
 * Applies the whole retention policy.
 *
 * @param now - Current time; injectable so the policy can be tested against a
 * fixed clock rather than whatever the test machine believes
 * @returns One outcome per resource
 */
export async function applyRetentionPolicy(
    now: Date = new Date(),
): Promise<readonly RetentionOutcome[]> {
    const outcomes: RetentionOutcome[] = [];

    for (const resource of RETAINED_RESOURCES) {
        try {
            const removed = await purgeResource(resource, now);
            if (removed !== null && removed > 0) {
                retentionPurged.inc({ resource }, removed);
            }
            outcomes.push({ resource, removed, failed: false });
        } catch (error) {
            logger.error({ error, resource }, "retention purge failed");
            outcomes.push({ resource, removed: null, failed: true });
        }
    }

    logger.info({ outcomes }, "retention policy applied");
    return outcomes;
}
