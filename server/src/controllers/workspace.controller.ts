import type { Request, Response } from "express";
import type { NotebookSummary } from "@homeworkcopy/contracts";
import {
    deleteWorkspaceForUser,
    getNotebookForUser,
    updateWorkspaceForUser,
} from "../services/workspace.service.js";
import { listNotebooksForScope } from "../services/collaboration.service.js";
import { createWorkspaceRecord } from "../repositories/workspace.repository.js";
import { listNotebooksQuerySchema } from "../validators/collaboration.validator.js";
import {
    createWorkspaceSchema,
    updateWorkspaceSchema,
    workspaceIdParamSchema,
} from "../validators/workspace.validator.js";
import { actorOf } from "../utils/actor.js";

/**
 * Lists the notebooks behind one dashboard tab.
 *
 * `scope` defaults to `mine`, so a client that has not adopted the Shared tab
 * keeps seeing exactly the notebooks it saw before.
 */
export async function listWorkspaces(req: Request, res: Response) {
    const { scope } = listNotebooksQuerySchema.parse(req.query);
    const notebooks = await listNotebooksForScope(req.session.user.id, scope);
    res.json(notebooks);
}

export async function getWorkspace(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const notebook = await getNotebookForUser(workspaceId, req.session.user.id);
    res.json(notebook);
}

export async function createWorkspace(req: Request, res: Response) {
    const input = createWorkspaceSchema.parse(req.body);
    const workspace = await createWorkspaceRecord(req.session.user.id, input);
    const notebook: NotebookSummary = {
        id: workspace.id,
        title: workspace.title,
        description: workspace.description,
        icon: workspace.icon,
        defaultModel: workspace.defaultModel,
        createdAt: workspace.createdAt.toISOString(),
        updatedAt: workspace.updatedAt.toISOString(),
        // A notebook is born private, owned by its creator, with one member.
        role: "OWNER",
        audience: "private",
        memberCount: 1,
        ownerName: req.session.user.name,
    };
    res.status(201).json(notebook);
}

export async function updateWorkspace(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const input = updateWorkspaceSchema.parse(req.body);
    await updateWorkspaceForUser(workspaceId, req.session.user.id, input);
    // Re-read so the response carries the same role and sharing state the
    // client already holds, rather than a narrower shape it would have to merge.
    res.json(await getNotebookForUser(workspaceId, req.session.user.id));
}

export async function deleteWorkspace(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    await deleteWorkspaceForUser(workspaceId, actorOf(req));
    res.status(204).send();
}
