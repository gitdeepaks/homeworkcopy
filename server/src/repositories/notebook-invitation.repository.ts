import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const notebookInvitationSelect = {
    id: true,
    workspaceId: true,
    email: true,
    role: true,
    status: true,
    expiresAt: true,
    invitedById: true,
    acceptedByUserId: true,
    acceptedAt: true,
    revokedAt: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type NotebookInvitationRecord = Prisma.NotebookInvitationGetPayload<{
    select: typeof notebookInvitationSelect;
}>;

/**
 * Creates a pending invitation.
 *
 * The caller holds the only copy of the plaintext token; this stores its hash.
 *
 * @param data - Notebook, invited address, role, token hash, expiry, and inviter
 * @returns The stored invitation
 */
export function createInvitationRecord(data: {
    workspaceId: string;
    email: string;
    role: NotebookInvitationRecord["role"];
    tokenHash: string;
    expiresAt: Date;
    invitedById: string;
}) {
    return prisma.notebookInvitation.create({
        data,
        select: notebookInvitationSelect,
    });
}

/**
 * Looks an invitation up by the hash of the token in a link.
 *
 * @param tokenHash - SHA-256 digest of the presented token
 * @returns The invitation, or `null` when no link matches
 */
export function findInvitationByTokenHash(tokenHash: string) {
    return prisma.notebookInvitation.findUnique({
        where: { tokenHash },
        select: notebookInvitationSelect,
    });
}

export function findInvitationByIdAndWorkspaceId(
    invitationId: string,
    workspaceId: string,
) {
    return prisma.notebookInvitation.findFirst({
        where: { id: invitationId, workspaceId },
        select: notebookInvitationSelect,
    });
}

/**
 * Lists a notebook's outstanding invitations.
 *
 * Accepted and revoked rows are excluded: they are history, and the share dialog
 * shows accepted invitees in the member list instead.
 *
 * @param workspaceId - Notebook to list invitations for
 * @returns Pending invitations, newest first
 */
export function findPendingInvitationsByWorkspaceId(workspaceId: string) {
    return prisma.notebookInvitation.findMany({
        where: { workspaceId, status: "PENDING" },
        select: notebookInvitationSelect,
        orderBy: { createdAt: "desc" },
    });
}

export function countPendingInvitations(workspaceId: string) {
    return prisma.notebookInvitation.count({
        where: { workspaceId, status: "PENDING" },
    });
}

export function findPendingInvitationForEmail(
    workspaceId: string,
    email: string,
) {
    return prisma.notebookInvitation.findFirst({
        where: { workspaceId, email, status: "PENDING" },
        select: notebookInvitationSelect,
    });
}

/**
 * Marks an invitation redeemed, but only if it is still pending.
 *
 * The status guard is what makes redemption single-use under concurrency: two
 * simultaneous accepts race on the same row and exactly one updates it.
 *
 * @param invitationId - Invitation being redeemed
 * @param acceptedByUserId - User who redeemed it
 * @param acceptedAt - Redemption instant
 * @returns Whether this call was the one that redeemed it
 */
export async function markInvitationAccepted(
    invitationId: string,
    acceptedByUserId: string,
    acceptedAt: Date,
): Promise<boolean> {
    const updated = await prisma.notebookInvitation.updateMany({
        where: { id: invitationId, status: "PENDING" },
        data: { status: "ACCEPTED", acceptedByUserId, acceptedAt },
    });

    return updated.count === 1;
}

/**
 * Revokes a pending invitation.
 *
 * @param invitationId - Invitation to revoke
 * @param workspaceId - Notebook it must belong to
 * @param revokedAt - Revocation instant
 * @returns Whether a pending invitation was revoked
 */
export async function markInvitationRevoked(
    invitationId: string,
    workspaceId: string,
    revokedAt: Date,
): Promise<boolean> {
    const updated = await prisma.notebookInvitation.updateMany({
        where: { id: invitationId, workspaceId, status: "PENDING" },
        data: { status: "REVOKED", revokedAt },
    });

    return updated.count === 1;
}
