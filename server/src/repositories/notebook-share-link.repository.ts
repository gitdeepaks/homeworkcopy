import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const shareLinkSelect = {
    id: true,
    workspaceId: true,
    expiresAt: true,
    revokedAt: true,
    createdById: true,
    lastJoinedAt: true,
    joinCount: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type ShareLinkRecord = Prisma.NotebookShareLinkGetPayload<{
    select: typeof shareLinkSelect;
}>;

/**
 * Replaces a notebook's share link with a freshly minted one.
 *
 * A notebook holds at most one link, so creating always overwrites: rotating and
 * enabling are the same operation, and a forwarded copy of the previous link
 * stops working the moment a new one exists.
 *
 * @param data - Notebook, token hash, expiry, and who minted it
 * @returns The stored link, without its token
 */
export function upsertShareLinkRecord(data: {
    workspaceId: string;
    tokenHash: string;
    expiresAt: Date;
    createdById: string;
}) {
    return prisma.notebookShareLink.upsert({
        where: { workspaceId: data.workspaceId },
        create: data,
        update: {
            tokenHash: data.tokenHash,
            expiresAt: data.expiresAt,
            createdById: data.createdById,
            revokedAt: null,
            lastJoinedAt: null,
            joinCount: 0,
        },
        select: shareLinkSelect,
    });
}

export function findShareLinkByWorkspaceId(workspaceId: string) {
    return prisma.notebookShareLink.findUnique({
        where: { workspaceId },
        select: shareLinkSelect,
    });
}

export function findShareLinkByTokenHash(tokenHash: string) {
    return prisma.notebookShareLink.findUnique({
        where: { tokenHash },
        select: shareLinkSelect,
    });
}

/**
 * Turns link sharing off.
 *
 * The row is kept with `revokedAt` set rather than deleted, so the audit trail
 * and the join counter survive the revocation.
 *
 * @param workspaceId - Notebook whose link is being revoked
 * @param revokedAt - Revocation instant
 * @returns Whether a live link was revoked
 */
export async function revokeShareLinkRecord(
    workspaceId: string,
    revokedAt: Date,
): Promise<boolean> {
    const updated = await prisma.notebookShareLink.updateMany({
        where: { workspaceId, revokedAt: null },
        data: { revokedAt },
    });

    return updated.count === 1;
}

/**
 * Records a redemption, but only while the link is still live.
 *
 * The guard closes the window between checking a link and using it: a link
 * revoked mid-request cannot record a join.
 *
 * @param shareLinkId - Link being redeemed
 * @param joinedAt - Redemption instant
 * @returns Whether the redemption was recorded
 */
export async function recordShareLinkJoin(
    shareLinkId: string,
    joinedAt: Date,
): Promise<boolean> {
    const updated = await prisma.notebookShareLink.updateMany({
        where: {
            id: shareLinkId,
            revokedAt: null,
            expiresAt: { gt: joinedAt },
        },
        data: { lastJoinedAt: joinedAt, joinCount: { increment: 1 } },
    });

    return updated.count === 1;
}
