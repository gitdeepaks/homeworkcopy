import {
    acceptShareResponseSchema,
    createdInvitationSchema,
    createdShareLinkSchema,
    notebookSharingSchema,
    auditEventSchema,
    type CreateShareLinkRequestInput,
    type InviteMemberRequest,
    type NotebookMemberRole,
} from "@homeworkcopy/contracts";
import { z } from "zod";
import { apiFetchVoid, apiFetchWithSchema } from "@/shared/lib/api";

function notebookPath(workspaceId: string) {
    return `/api/workspaces/${workspaceId}`;
}

export function getNotebookSharing(workspaceId: string) {
    return apiFetchWithSchema(
        `${notebookPath(workspaceId)}/sharing`,
        notebookSharingSchema,
    );
}

export function listNotebookActivity(workspaceId: string) {
    return apiFetchWithSchema(
        `${notebookPath(workspaceId)}/activity`,
        z.array(auditEventSchema),
    );
}

/**
 * Invites someone and returns the one-time link.
 *
 * The link is shown once and never fetched again, so the caller must surface it
 * immediately rather than storing it for later.
 */
export function inviteMember(
    workspaceId: string,
    input: InviteMemberRequest,
) {
    return apiFetchWithSchema(
        `${notebookPath(workspaceId)}/invitations`,
        createdInvitationSchema,
        { method: "POST", body: JSON.stringify(input) },
    );
}

export function revokeInvitation(workspaceId: string, invitationId: string) {
    return apiFetchVoid(
        `${notebookPath(workspaceId)}/invitations/${invitationId}`,
        { method: "DELETE" },
    );
}

export function updateMemberRole(
    workspaceId: string,
    memberUserId: string,
    role: NotebookMemberRole,
) {
    return apiFetchVoid(
        `${notebookPath(workspaceId)}/members/${memberUserId}`,
        { method: "PATCH", body: JSON.stringify({ role }) },
    );
}

export function removeMember(workspaceId: string, memberUserId: string) {
    return apiFetchVoid(
        `${notebookPath(workspaceId)}/members/${memberUserId}`,
        { method: "DELETE" },
    );
}

export function leaveNotebook(workspaceId: string) {
    return apiFetchVoid(`${notebookPath(workspaceId)}/leave`, {
        method: "POST",
    });
}

export function transferOwnership(workspaceId: string, userId: string) {
    return apiFetchVoid(`${notebookPath(workspaceId)}/transfer`, {
        method: "POST",
        body: JSON.stringify({ userId }),
    });
}

export function createShareLink(
    workspaceId: string,
    input: CreateShareLinkRequestInput = {},
) {
    return apiFetchWithSchema(
        `${notebookPath(workspaceId)}/share-link`,
        createdShareLinkSchema,
        { method: "POST", body: JSON.stringify(input) },
    );
}

export function revokeShareLink(workspaceId: string) {
    return apiFetchVoid(`${notebookPath(workspaceId)}/share-link`, {
        method: "DELETE",
    });
}

export function acceptInvitation(token: string) {
    return apiFetchWithSchema(
        `/api/invitations/${token}/accept`,
        acceptShareResponseSchema,
        { method: "POST" },
    );
}

export function acceptShareLink(token: string) {
    return apiFetchWithSchema(
        `/api/share-links/${token}/accept`,
        acceptShareResponseSchema,
        { method: "POST" },
    );
}
