/**
 * The single place that decides who may do what inside a notebook.
 *
 * Before Phase 10 every service answered "does this user own this notebook?" for
 * itself. That worked while the answer was always yes-or-no, but a notebook with
 * an owner, editors, and viewers needs one answer, derived one way, for every
 * resource. So each caller now names the permission it needs and this module
 * resolves the reader's role and consults the role matrix in
 * @homeworkcopy/contracts. No service reads `workspace.userId` directly, and no
 * route decides access on its own.
 *
 * The two failure modes are deliberately different:
 *
 * - A user with no relationship to a notebook gets `404`. Telling them a
 *   notebook exists but is not theirs would let anyone enumerate other people's
 *   notebooks by id.
 * - A member whose role is too narrow gets `403`, because they already know the
 *   notebook exists and the honest answer is that this action is not theirs.
 */

import {
    hasNotebookPermission,
    type NotebookMemberRole,
    type NotebookPermission,
    type NotebookRole,
} from "@homeworkcopy/contracts";
import { findNotebookMember } from "../repositories/notebook-member.repository.js";
import {
    findWorkspaceWithOwnerById,
    type WorkspaceRecord,
    type WorkspaceWithOwner,
} from "../repositories/workspace.repository.js";
import { ForbiddenError, NotFoundError } from "../types/app-error.js";

/**
 * The acting user, as resolved from their verified session.
 *
 * Carries the name and email that membership operations attribute their effects
 * to, so no caller has to re-read the user to record who did something.
 */
export type Actor = {
    id: string;
    name: string;
    email: string;
};

/** A resolved answer to "who is this reader, in this notebook?". */
export type NotebookAccess = {
    workspace: WorkspaceRecord;
    /** The owner's id. Never sent to a client; used by membership operations. */
    ownerId: string;
    ownerName: string;
    userId: string;
    role: NotebookRole;
};

/**
 * Narrows a notebook row to the fields that are safe to return.
 *
 * The owner id stays behind: it belongs to authorization, not to responses.
 */
function toWorkspaceRecord(workspace: WorkspaceWithOwner): WorkspaceRecord {
    return {
        id: workspace.id,
        title: workspace.title,
        description: workspace.description,
        icon: workspace.icon,
        defaultModel: workspace.defaultModel,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
    };
}

/**
 * Decides a reader's effective role from ownership and membership alone.
 *
 * Pure, and separated from the queries that feed it, so the rule that ownership
 * always wins is stated in exactly one place and can be tested without a
 * database.
 *
 * @param input - Owner id, reading user, and their membership role if any
 * @returns The effective role, or `null` when the user has no access at all
 */
export function effectiveNotebookRole(input: {
    ownerId: string;
    userId: string;
    membershipRole: NotebookMemberRole | null;
}): NotebookRole | null {
    if (input.ownerId === input.userId) {
        return "OWNER";
    }

    return input.membershipRole;
}

/**
 * Resolves a user's effective role in a notebook.
 *
 * Ownership is checked first and short-circuits the membership lookup, so the
 * common single-user case still costs one query.
 *
 * @param workspaceId - Notebook being accessed
 * @param userId - Authenticated user's id
 * @returns The notebook and the reader's role
 * @throws {NotFoundError} When the notebook does not exist, or the user has no
 * relationship to it at all
 */
export async function resolveNotebookAccess(
    workspaceId: string,
    userId: string,
): Promise<NotebookAccess> {
    const workspace = await findWorkspaceWithOwnerById(workspaceId);

    if (!workspace) {
        throw new NotFoundError("Notebook not found");
    }

    const base = {
        workspace: toWorkspaceRecord(workspace),
        ownerId: workspace.userId,
        ownerName: workspace.user.name,
        userId,
    };

    const membership =
        workspace.userId === userId
            ? null
            : await findNotebookMember(workspaceId, userId);

    const role = effectiveNotebookRole({
        ownerId: workspace.userId,
        userId,
        membershipRole: membership?.role ?? null,
    });

    if (role === null) {
        throw new NotFoundError("Notebook not found");
    }

    return { ...base, role };
}

/**
 * Authorizes one action against one notebook.
 *
 * This is the function every notebook-scoped service calls. Because the check
 * happens on each request rather than from a cached claim, removing a member or
 * revoking their role takes effect on their very next request — there is no
 * session to wait out.
 *
 * @param workspaceId - Notebook being acted on
 * @param userId - Authenticated user's id
 * @param permission - The action being attempted
 * @returns The notebook and the reader's role
 * @throws {NotFoundError} When the notebook is not visible to this user
 * @throws {ForbiddenError} When the user's role does not grant the permission
 */
export async function authorizeNotebook(
    workspaceId: string,
    userId: string,
    permission: NotebookPermission,
): Promise<NotebookAccess> {
    const access = await resolveNotebookAccess(workspaceId, userId);

    if (!hasNotebookPermission(access.role, permission)) {
        throw new ForbiddenError(FORBIDDEN_MESSAGES[permission]);
    }

    return access;
}

/**
 * Asserts a permission without needing the notebook back.
 *
 * @param workspaceId - Notebook being acted on
 * @param userId - Authenticated user's id
 * @param permission - The action being attempted
 * @returns Resolves when the action is allowed
 */
export async function assertNotebookPermission(
    workspaceId: string,
    userId: string,
    permission: NotebookPermission,
): Promise<void> {
    await authorizeNotebook(workspaceId, userId, permission);
}

/**
 * Why an action was refused, phrased for the person who tried it.
 *
 * Every permission has its own line so a viewer is told what their role can do,
 * not handed a generic "forbidden" they cannot act on.
 */
const FORBIDDEN_MESSAGES: Readonly<Record<NotebookPermission, string>> = {
    "notebook:read": "You do not have access to this notebook.",
    "notebook:update": "Only the notebook owner can change its settings.",
    "notebook:delete": "Only the notebook owner can delete it.",
    "notebook:transfer": "Only the notebook owner can transfer ownership.",
    "source:create": "You have view-only access, so you cannot add sources.",
    "source:delete": "You have view-only access, so you cannot remove sources.",
    "source:reprocess":
        "You have view-only access, so you cannot reprocess sources.",
    "chat:write":
        "You have view-only access. You can read this notebook's chats but not add to them.",
    "conversation:manage":
        "You have view-only access, so you cannot change conversations.",
    "output:create": "You have view-only access, so you cannot create outputs.",
    "output:update": "You have view-only access, so you cannot change outputs.",
    "output:delete": "You have view-only access, so you cannot delete outputs.",
    "output:download":
        "You have view-only access, so you cannot download output media.",
    "note:create": "You have view-only access, so you cannot write notes.",
    "note:update": "You have view-only access, so you cannot edit notes.",
    "note:delete": "You have view-only access, so you cannot delete notes.",
    "member:read": "You do not have access to this notebook's members.",
    "notebook:export": "You do not have access to this notebook.",
    "member:manage": "Only the notebook owner can manage who has access.",
    "share:manage": "Only the notebook owner can change sharing.",
    "audit:read": "Only the notebook owner can see notebook activity.",
};

export { FORBIDDEN_MESSAGES };
