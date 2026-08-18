import {
    deleteWorkspaceRecord,
    updateWorkspaceRecord,
    type WorkspaceRecord,
} from "../repositories/workspace.repository.js";
import { countNotebookMembers } from "../repositories/notebook-member.repository.js";
import { deleteWorkspaceVectors } from "../lib/pinecone.js";
import { logger } from "../lib/logger.js";
import type { NotebookSummary } from "@homeworkcopy/contracts";
import type { UpdateWorkspaceInput } from "../validators/workspace.validator.js";
import {
    authorizeNotebook,
    resolveNotebookAccess,
    type Actor,
} from "./notebook-access.service.js";

/**
 * Loads a notebook for anyone allowed to read it.
 *
 * Ownership is no longer the question — membership is — so this returns the
 * notebook together with the reader's role and how widely it is shared, which is
 * what the shell needs to decide which controls to offer.
 *
 * @param workspaceId - Notebook to fetch
 * @param userId - Authenticated user's id
 * @returns The notebook, the reader's role, and its member count
 * @throws {NotFoundError} When the notebook does not exist or is not visible to
 * this user
 */
export async function getNotebookForUser(
    workspaceId: string,
    userId: string,
): Promise<NotebookSummary> {
    const access = await authorizeNotebook(
        workspaceId,
        userId,
        "notebook:read",
    );
    const collaboratorCount = await countNotebookMembers(workspaceId);
    const memberCount = collaboratorCount + 1;

    return {
        id: access.workspace.id,
        title: access.workspace.title,
        description: access.workspace.description,
        icon: access.workspace.icon,
        defaultModel: access.workspace.defaultModel,
        createdAt: access.workspace.createdAt.toISOString(),
        updatedAt: access.workspace.updatedAt.toISOString(),
        role: access.role,
        audience: memberCount > 1 ? "shared" : "private",
        memberCount,
        ownerName: access.ownerName,
    };
}

/**
 * Loads a notebook's stored fields for internal use.
 *
 * Callers that need the record itself — the chat pipeline reading the default
 * model, for instance — go through this so the permission they require is stated
 * at the call site rather than assumed.
 *
 * @param workspaceId - Notebook to fetch
 * @param userId - Authenticated user's id
 * @returns The notebook record
 */
export async function readNotebookRecord(
    workspaceId: string,
    userId: string,
): Promise<WorkspaceRecord> {
    const access = await resolveNotebookAccess(workspaceId, userId);
    return access.workspace;
}

/**
 * Updates notebook settings.
 *
 * @param workspaceId - Notebook to update
 * @param userId - Authenticated user's id
 * @param input - Partial notebook fields to change
 * @returns Updated notebook record
 * @throws {ForbiddenError} When the caller is not the owner
 */
export async function updateWorkspaceForUser(
    workspaceId: string,
    userId: string,
    input: UpdateWorkspaceInput,
) {
    await authorizeNotebook(workspaceId, userId, "notebook:update");
    return updateWorkspaceRecord(workspaceId, input);
}

/**
 * Deletes a notebook and its Pinecone vector namespace.
 *
 * Every membership, invitation, share link, and audit row cascades with the
 * notebook row, so deletion also ends every collaborator's access. Pinecone
 * cleanup is best-effort: deletion continues even if vector removal fails, and
 * the failure is logged rather than swallowed.
 *
 * @param workspaceId - Notebook to delete
 * @param actor - The owner performing the deletion
 * @returns Resolves when the notebook row is deleted
 * @throws {ForbiddenError} When the caller is not the owner
 */
export async function deleteWorkspaceForUser(
    workspaceId: string,
    actor: Actor,
) {
    const access = await authorizeNotebook(
        workspaceId,
        actor.id,
        "notebook:delete",
    );

    // Deliberately a log line rather than an audit row. Audit rows cascade with
    // the notebook, so a `NOTEBOOK_DELETED` row would be removed by the very
    // operation it records and no one could ever read it. The `NOTEBOOK_DELETED`
    // event type stays reserved for the account-level trail that outlives a
    // notebook; until that exists, the durable record is here.
    logger.info(
        { workspaceId, actorUserId: actor.id, title: access.workspace.title },
        "notebook deleted",
    );

    try {
        await deleteWorkspaceVectors(workspaceId);
    } catch (error) {
        logger.error({ error, workspaceId }, "pinecone namespace delete failed");
    }

    await deleteWorkspaceRecord(workspaceId);
}
