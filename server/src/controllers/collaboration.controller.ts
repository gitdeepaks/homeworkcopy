import type { Request, Response } from "express";
import { AUDIT_EVENT_PAGE_SIZE, listAuditEvents } from "../services/audit.service.js";
import {
    acceptInvitation,
    acceptShareLink,
    createNotebookShareLink,
    getNotebookSharing,
    inviteMemberToNotebook,
    leaveNotebook,
    removeNotebookMember,
    revokeInvitation,
    revokeNotebookShareLink,
    transferNotebookOwnership,
    updateNotebookMemberRoleForOwner,
} from "../services/collaboration.service.js";
import { authorizeNotebook } from "../services/notebook-access.service.js";
import {
    createShareLinkRequestSchema,
    invitationIdParamSchema,
    inviteMemberRequestSchema,
    memberIdParamSchema,
    shareTokenParamSchema,
    transferOwnershipRequestSchema,
    updateMemberRoleRequestSchema,
} from "../validators/collaboration.validator.js";
import { workspaceIdParamSchema } from "../validators/workspace.validator.js";
import { actorOf } from "../utils/actor.js";

/**
 * Marks a response as off-limits to crawlers and link unfurlers.
 *
 * Applied to every token-redeeming route: a share link is a bearer capability,
 * so a preview fetch must never be able to surface one in an index.
 */
function denyIndexing(res: Response): void {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    res.setHeader("Cache-Control", "no-store");
}

export async function getSharing(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const sharing = await getNotebookSharing(workspaceId, req.session.user.id);
    res.json(sharing);
}

export async function inviteMember(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const input = inviteMemberRequestSchema.parse(req.body);
    denyIndexing(res);
    const created = await inviteMemberToNotebook(
        workspaceId,
        actorOf(req),
        input,
    );
    res.status(201).json(created);
}

export async function revokeMemberInvitation(req: Request, res: Response) {
    const { workspaceId, invitationId } = invitationIdParamSchema.parse(
        req.params,
    );
    await revokeInvitation(workspaceId, actorOf(req), invitationId);
    res.status(204).send();
}

export async function updateMemberRole(req: Request, res: Response) {
    const { workspaceId, memberUserId } = memberIdParamSchema.parse(req.params);
    const { role } = updateMemberRoleRequestSchema.parse(req.body);
    const updated = await updateNotebookMemberRoleForOwner(
        workspaceId,
        actorOf(req),
        memberUserId,
        role,
    );
    res.json({ userId: memberUserId, role: updated });
}

export async function removeMember(req: Request, res: Response) {
    const { workspaceId, memberUserId } = memberIdParamSchema.parse(req.params);
    await removeNotebookMember(workspaceId, actorOf(req), memberUserId);
    res.status(204).send();
}

export async function leaveSharedNotebook(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    await leaveNotebook(workspaceId, actorOf(req));
    res.status(204).send();
}

export async function transferOwnership(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const { userId } = transferOwnershipRequestSchema.parse(req.body);
    await transferNotebookOwnership(workspaceId, actorOf(req), userId);
    res.status(204).send();
}

export async function createShareLink(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const input = createShareLinkRequestSchema.parse(req.body ?? {});
    denyIndexing(res);
    const created = await createNotebookShareLink(
        workspaceId,
        actorOf(req),
        input,
    );
    res.status(201).json(created);
}

export async function revokeShareLink(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    await revokeNotebookShareLink(workspaceId, actorOf(req));
    res.status(204).send();
}

export async function acceptInvitationToken(req: Request, res: Response) {
    const { token } = shareTokenParamSchema.parse(req.params);
    denyIndexing(res);
    const accepted = await acceptInvitation(token, actorOf(req));
    res.json(accepted);
}

export async function acceptShareLinkToken(req: Request, res: Response) {
    const { token } = shareTokenParamSchema.parse(req.params);
    denyIndexing(res);
    const accepted = await acceptShareLink(token, actorOf(req));
    res.json(accepted);
}

export async function listNotebookActivity(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    await authorizeNotebook(workspaceId, req.session.user.id, "audit:read");
    const events = await listAuditEvents(workspaceId, AUDIT_EVENT_PAGE_SIZE);
    res.json(events);
}
