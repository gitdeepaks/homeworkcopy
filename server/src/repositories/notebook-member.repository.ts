import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const notebookMemberSelect = {
    id: true,
    workspaceId: true,
    userId: true,
    role: true,
    invitedById: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type NotebookMemberRecord = Prisma.NotebookMemberGetPayload<{
    select: typeof notebookMemberSelect;
}>;

const notebookMemberWithUserSelect = {
    ...notebookMemberSelect,
    user: {
        select: { id: true, name: true, email: true, image: true },
    },
} as const;

export type NotebookMemberWithUser = Prisma.NotebookMemberGetPayload<{
    select: typeof notebookMemberWithUserSelect;
}>;

/**
 * Reads one person's membership of one notebook.
 *
 * This is the hot path behind every authorized request that is not the owner's,
 * so it is a single lookup on the `(workspaceId, userId)` unique index.
 *
 * @param workspaceId - Notebook being accessed
 * @param userId - User asking for access
 * @returns The membership row, or `null` when there is none
 */
export function findNotebookMember(workspaceId: string, userId: string) {
    return prisma.notebookMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: notebookMemberSelect,
    });
}

/**
 * Lists a notebook's collaborators with the profile fields the share dialog
 * renders.
 *
 * @param workspaceId - Notebook to list members of
 * @returns Membership rows joined to their users, oldest first
 */
export function findNotebookMembersWithUsers(workspaceId: string) {
    return prisma.notebookMember.findMany({
        where: { workspaceId },
        select: notebookMemberWithUserSelect,
        orderBy: { createdAt: "asc" },
    });
}

/**
 * Counts a notebook's collaborators, excluding the owner.
 *
 * @param workspaceId - Notebook to count members of
 * @returns Number of membership rows
 */
export function countNotebookMembers(workspaceId: string) {
    return prisma.notebookMember.count({ where: { workspaceId } });
}

/**
 * Counts collaborators across several notebooks in one query.
 *
 * @param workspaceIds - Notebooks to count members of
 * @returns Member count per notebook id, omitting notebooks with none
 */
export async function countMembersByWorkspaceIds(
    workspaceIds: readonly string[],
): Promise<Map<string, number>> {
    if (workspaceIds.length === 0) {
        return new Map();
    }

    const grouped = await prisma.notebookMember.groupBy({
        by: ["workspaceId"],
        where: { workspaceId: { in: [...workspaceIds] } },
        _count: { _all: true },
    });

    return new Map(grouped.map((row) => [row.workspaceId, row._count._all]));
}

/**
 * Grants someone access, or updates the role they already had.
 *
 * Upsert rather than create so that redeeming a link twice, or re-inviting
 * someone who is already a member, is not an error the caller has to unwind.
 *
 * @param input - Notebook, user, granted role, and who granted it
 * @returns The membership row
 */
export function upsertNotebookMember(input: {
    workspaceId: string;
    userId: string;
    role: NotebookMemberRecord["role"];
    invitedById: string | null;
}) {
    return prisma.notebookMember.upsert({
        where: {
            workspaceId_userId: {
                workspaceId: input.workspaceId,
                userId: input.userId,
            },
        },
        create: {
            workspaceId: input.workspaceId,
            userId: input.userId,
            role: input.role,
            invitedById: input.invitedById,
        },
        update: { role: input.role },
        select: notebookMemberSelect,
    });
}

/**
 * Changes an existing member's role.
 *
 * @param workspaceId - Notebook the membership belongs to
 * @param userId - Member whose role is changing
 * @param role - New role
 * @returns The updated row, or `null` when there was no membership to change
 */
export async function updateNotebookMemberRole(
    workspaceId: string,
    userId: string,
    role: NotebookMemberRecord["role"],
): Promise<NotebookMemberRecord | null> {
    const updated = await prisma.notebookMember.updateMany({
        where: { workspaceId, userId },
        data: { role },
    });

    if (updated.count === 0) {
        return null;
    }

    return prisma.notebookMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: notebookMemberSelect,
    });
}

/**
 * Revokes access.
 *
 * @param workspaceId - Notebook to remove the member from
 * @param userId - Member losing access
 * @returns Whether a membership row was removed
 */
export async function deleteNotebookMember(
    workspaceId: string,
    userId: string,
): Promise<boolean> {
    const deleted = await prisma.notebookMember.deleteMany({
        where: { workspaceId, userId },
    });

    return deleted.count > 0;
}
