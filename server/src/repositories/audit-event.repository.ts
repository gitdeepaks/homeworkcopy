import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const auditEventSelect = {
    id: true,
    workspaceId: true,
    type: true,
    actorUserId: true,
    actorName: true,
    context: true,
    createdAt: true,
} as const;

export type AuditEventRecord = Prisma.AuditEventGetPayload<{
    select: typeof auditEventSelect;
}>;

export type CreateAuditEventData = {
    workspaceId: string;
    type: AuditEventRecord["type"];
    actorUserId: string | null;
    actorName: string | null;
    context?: Prisma.InputJsonValue;
};

/**
 * Appends one audit row.
 *
 * @param data - Notebook, event type, actor, and structured context
 * @returns The stored row
 */
export function createAuditEventRecord(data: CreateAuditEventData) {
    return prisma.auditEvent.create({
        data,
        select: auditEventSelect,
    });
}

/**
 * Reads a notebook's recent activity.
 *
 * @param workspaceId - Notebook to read activity for
 * @param limit - Maximum rows to return
 * @returns Audit rows, newest first
 */
export function findAuditEventsByWorkspaceId(
    workspaceId: string,
    limit: number,
) {
    return prisma.auditEvent.findMany({
        where: { workspaceId },
        select: auditEventSelect,
        orderBy: { createdAt: "desc" },
        take: limit,
    });
}
