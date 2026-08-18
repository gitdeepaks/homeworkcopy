import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";
import type {
    CreateWorkspaceInput,
    UpdateWorkspaceInput,
} from "../validators/workspace.validator.js";

export const workspaceSelect = {
    id: true,
    title: true,
    description: true,
    icon: true,
    defaultModel: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type WorkspaceRecord = {
    id: string;
    title: string;
    description: string | null;
    icon: string | null;
    defaultModel: string;
    createdAt: Date;
    updatedAt: Date;
};

/**
 * Notebook fields plus the owner, which is what authorization needs.
 *
 * `userId` is deliberately part of this select and not of {@link workspaceSelect}:
 * the owner id decides access and must never be shaped into an API response by
 * accident.
 */
const workspaceWithOwnerSelect = {
    ...workspaceSelect,
    userId: true,
    user: { select: { id: true, name: true, email: true, image: true } },
} as const;

export type WorkspaceWithOwner = Prisma.WorkspaceGetPayload<{
    select: typeof workspaceWithOwnerSelect;
}>;

/**
 * Loads a notebook without asking who is reading it.
 *
 * Only the access layer may call this. Every other caller goes through
 * `authorizeNotebook`, which decides what the reader's role permits before any
 * notebook data is returned.
 *
 * @param workspaceId - Notebook to load
 * @returns The notebook with its owner, or `null` when it does not exist
 */
export function findWorkspaceWithOwnerById(workspaceId: string) {
    return prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: workspaceWithOwnerSelect,
    });
}

/**
 * Lists the notebooks a user owns.
 *
 * @param userId - Owner
 * @returns Owned notebooks with owner profile, most recently updated first
 */
export function findOwnedWorkspacesWithOwner(userId: string) {
    return prisma.workspace.findMany({
        where: { userId },
        select: workspaceWithOwnerSelect,
        orderBy: { updatedAt: "desc" },
    });
}

/**
 * Lists the notebooks shared with a user, and the role each was shared at.
 *
 * Ordered by the notebook's own activity rather than when the user joined, so
 * the Shared tab surfaces what is moving, not what was invited longest ago.
 *
 * @param userId - Collaborator
 * @returns Membership rows joined to their notebooks
 */
export function findSharedWorkspacesForUser(userId: string) {
    return prisma.notebookMember.findMany({
        where: { userId },
        select: {
            role: true,
            workspace: { select: workspaceWithOwnerSelect },
        },
        orderBy: { workspace: { updatedAt: "desc" } },
    });
}

/**
 * Hands a notebook to a new owner in one atomic step.
 *
 * The order matters and is enforced by the transaction: the incoming owner's
 * membership row must be gone before they can be named owner, because the
 * database rejects an owner who is also a member. The outgoing owner is then
 * demoted to editor rather than dropped, so a transfer never locks someone out
 * of a notebook they built.
 *
 * @param workspaceId - Notebook changing hands
 * @param fromUserId - Current owner, who becomes an editor
 * @param toUserId - Incoming owner, who must already be a member
 * @returns Resolves once ownership and both memberships are consistent
 */
export function transferWorkspaceOwnership(
    workspaceId: string,
    fromUserId: string,
    toUserId: string,
) {
    return prisma.$transaction(async (tx) => {
        await tx.notebookMember.deleteMany({
            where: { workspaceId, userId: toUserId },
        });

        await tx.workspace.update({
            where: { id: workspaceId, userId: fromUserId },
            data: { userId: toUserId },
        });

        await tx.notebookMember.upsert({
            where: {
                workspaceId_userId: { workspaceId, userId: fromUserId },
            },
            create: {
                workspaceId,
                userId: fromUserId,
                role: "EDITOR",
                invitedById: toUserId,
            },
            update: { role: "EDITOR" },
        });
    });
}

export function createWorkspaceRecord(
    userId: string,
    data: CreateWorkspaceInput,
) {
    return prisma.workspace.create({
        data: {
            userId,
            ...data,
        },
        select: workspaceSelect,
    });
}

export function updateWorkspaceRecord(
    workspaceId: string,
    data: UpdateWorkspaceInput,
) {
    return prisma.workspace.update({
        where: { id: workspaceId },
        data,
        select: workspaceSelect,
    });
}

export async function deleteWorkspaceRecord(workspaceId: string) {
    await prisma.workspace.delete({
        where: { id: workspaceId },
    });
}
