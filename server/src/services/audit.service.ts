/**
 * The notebook activity trail.
 *
 * Recorded so a notebook owner can answer "who did that, and when?" about the
 * operations that either change who can reach the notebook or destroy something
 * that cannot be brought back. Reads are not recorded: logging every page view
 * of a shared notebook would bury the events that matter.
 *
 * Two properties are load-bearing:
 *
 * - Writing an audit row never fails the operation it describes. An audit trail
 *   that can take down a deletion is worse than one with an occasional gap, and
 *   the gap is visible in the logs.
 * - The actor's display name is captured at write time. The row therefore stays
 *   readable after that account is deleted, which is exactly when someone is
 *   most likely to be reading it.
 */

import {
    auditEventContextSchema,
    readAuditEventContext,
    type AuditEvent,
    type AuditEventContext,
    type AuditEventType,
} from "@homeworkcopy/contracts";
import { logger } from "../lib/logger.js";
import {
    createAuditEventRecord,
    findAuditEventsByWorkspaceId,
    type AuditEventRecord,
} from "../repositories/audit-event.repository.js";
import { toPrismaJson } from "../utils/prisma-json.js";

/** How much activity the notebook's activity view returns. */
export const AUDIT_EVENT_PAGE_SIZE = 100;

export type RecordAuditEventInput = {
    workspaceId: string;
    type: AuditEventType;
    actor: { id: string; name: string };
    context?: AuditEventContext;
};

/**
 * Appends one audit row, and never lets doing so break the caller.
 *
 * The context is re-validated here rather than trusted, because this is the last
 * point before it becomes a long-lived database row: anything outside
 * {@link auditEventContextSchema} — source text, chat content, provider payloads —
 * is dropped rather than retained.
 *
 * @param input - Notebook, event type, actor, and structured context
 * @returns Resolves once the row is written, or the failure is logged
 */
export async function recordAuditEvent(
    input: RecordAuditEventInput,
): Promise<void> {
    const parsedContext = auditEventContextSchema.safeParse(input.context ?? {});

    if (!parsedContext.success) {
        logger.warn(
            { workspaceId: input.workspaceId, type: input.type },
            "audit context rejected",
        );
    }

    const context = parsedContext.success ? parsedContext.data : {};

    try {
        await createAuditEventRecord({
            workspaceId: input.workspaceId,
            type: input.type,
            actorUserId: input.actor.id,
            actorName: input.actor.name,
            context: toPrismaJson(context),
        });
    } catch (error) {
        logger.error(
            { error, workspaceId: input.workspaceId, type: input.type },
            "audit event write failed",
        );
    }
}

/**
 * Shapes a stored row for the API.
 *
 * @param record - Audit row as stored
 * @returns The event in its contract shape
 */
export function toAuditEvent(record: AuditEventRecord): AuditEvent {
    return {
        id: record.id,
        workspaceId: record.workspaceId,
        type: record.type,
        actorUserId: record.actorUserId,
        actorName: record.actorName,
        context: readAuditEventContext(record.context),
        createdAt: record.createdAt.toISOString(),
    };
}

/**
 * Reads a notebook's recent activity.
 *
 * @param workspaceId - Notebook to read activity for
 * @param limit - Maximum events to return
 * @returns Events, newest first
 */
export async function listAuditEvents(
    workspaceId: string,
    limit: number = AUDIT_EVENT_PAGE_SIZE,
): Promise<AuditEvent[]> {
    const records = await findAuditEventsByWorkspaceId(workspaceId, limit);
    return records.map(toAuditEvent);
}
