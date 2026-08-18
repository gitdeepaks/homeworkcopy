/**
 * Notebook membership, invitations, link sharing, and ownership transfer.
 *
 * Access is granted through exactly one mechanism: a membership row. An
 * invitation and a share link are two ways to obtain one, which is why revoking
 * either stops future joins but does not evict people who already joined — those
 * are member removals, and the share dialog says so.
 *
 * Personal memory is deliberately absent from this module. Mem0 memories are
 * keyed by the authenticated user and reached through routes that are not
 * notebook-scoped, so no membership can ever widen access to them. See
 * `memory.routes.ts`.
 */

import {
    invitationRejectionReason,
    INVITATION_TTL_DAYS,
    NOTEBOOK_MEMBER_MAX,
    NOTEBOOK_PENDING_INVITATION_MAX,
    shareLinkRejectionReason,
    type AcceptShareResponse,
    type CreatedInvitation,
    type CreatedShareLink,
    type CreateShareLinkRequest,
    type InviteMemberRequest,
    type NotebookAudience,
    type NotebookInvitation,
    type NotebookMember,
    type NotebookMemberRole,
    type NotebookScope,
    type NotebookSharing,
    type NotebookSummary,
    type ShareLink,
} from "@homeworkcopy/contracts";
import {
    expiryFromNow,
    generateShareToken,
    hashShareToken,
} from "../lib/share-token.js";
import {
    countPendingInvitations,
    createInvitationRecord,
    findInvitationByIdAndWorkspaceId,
    findInvitationByTokenHash,
    findPendingInvitationForEmail,
    findPendingInvitationsByWorkspaceId,
    markInvitationAccepted,
    markInvitationRevoked,
    type NotebookInvitationRecord,
} from "../repositories/notebook-invitation.repository.js";
import {
    countMembersByWorkspaceIds,
    countNotebookMembers,
    deleteNotebookMember,
    findNotebookMember,
    findNotebookMembersWithUsers,
    updateNotebookMemberRole,
    upsertNotebookMember,
} from "../repositories/notebook-member.repository.js";
import {
    findShareLinkByTokenHash,
    findShareLinkByWorkspaceId,
    recordShareLinkJoin,
    revokeShareLinkRecord,
    upsertShareLinkRecord,
    type ShareLinkRecord,
} from "../repositories/notebook-share-link.repository.js";
import {
    findOwnedWorkspacesWithOwner,
    findSharedWorkspacesForUser,
    findWorkspaceWithOwnerById,
    transferWorkspaceOwnership,
    type WorkspaceWithOwner,
} from "../repositories/workspace.repository.js";
import { findUsersByEmail } from "../repositories/user.repository.js";
import {
    ConflictError,
    NotFoundError,
    ShareRejectedError,
    ValidationError,
} from "../types/app-error.js";
import { recordAuditEvent } from "./audit.service.js";
import { authorizeNotebook, type Actor } from "./notebook-access.service.js";

export type { Actor };

/**
 * Where invitation and share links point.
 *
 * The client origin, never a header the requester controls: a `Host` taken from
 * the request would let an attacker mint a link on their own domain and phish
 * the invitee with it.
 */
function clientOrigin(): string {
    const configured = process.env.CLIENT_URL?.trim();

    if (!configured) {
        throw new ValidationError(
            "Sharing is not configured. CLIENT_URL must be set to build invitation links.",
        );
    }

    return configured.replace(/\/+$/, "");
}

function inviteUrl(token: string): string {
    return `${clientOrigin()}/invite/${token}`;
}

function shareUrl(token: string): string {
    return `${clientOrigin()}/share/${token}`;
}

function toInvitation(record: NotebookInvitationRecord): NotebookInvitation {
    return {
        id: record.id,
        email: record.email,
        role: record.role,
        status: record.status,
        invitedByUserId: record.invitedById,
        expiresAt: record.expiresAt.toISOString(),
        createdAt: record.createdAt.toISOString(),
    };
}

/**
 * Shapes a share link for the API.
 *
 * A revoked or expired link is reported as absent rather than as a dead row: to
 * the person reading the share dialog, "sharing is off" is the truth, and a
 * disabled link they cannot use is only confusing.
 */
function toShareLink(record: ShareLinkRecord, now: Date): ShareLink | null {
    if (shareLinkRejectionReason(record, now) !== null) {
        return null;
    }

    return {
        id: record.id,
        role: "VIEWER",
        expiresAt: record.expiresAt.toISOString(),
        createdAt: record.createdAt.toISOString(),
        createdByUserId: record.createdById,
        lastJoinedAt: record.lastJoinedAt?.toISOString() ?? null,
        joinCount: record.joinCount,
    };
}

function ownerMember(workspace: WorkspaceWithOwner): NotebookMember {
    return {
        userId: workspace.user.id,
        name: workspace.user.name,
        email: workspace.user.email,
        image: workspace.user.image,
        role: "OWNER",
        joinedAt: workspace.createdAt.toISOString(),
        invitedByUserId: null,
    };
}

function toSummary(
    workspace: WorkspaceWithOwner,
    role: NotebookSummary["role"],
    memberCount: number,
): NotebookSummary {
    const audience: NotebookAudience = memberCount > 1 ? "shared" : "private";

    return {
        id: workspace.id,
        title: workspace.title,
        description: workspace.description,
        icon: workspace.icon,
        defaultModel: workspace.defaultModel,
        createdAt: workspace.createdAt.toISOString(),
        updatedAt: workspace.updatedAt.toISOString(),
        role,
        audience,
        memberCount,
        ownerName: workspace.user.name,
    };
}

/**
 * Lists the notebooks behind one dashboard tab.
 *
 * Member counts are fetched in one grouped query rather than per notebook, so a
 * dashboard with many notebooks still costs two round trips.
 *
 * @param userId - Authenticated user's id
 * @param scope - `mine` for owned notebooks, `shared` for ones shared with them
 * @returns Notebook summaries carrying the reader's own role
 */
export async function listNotebooksForScope(
    userId: string,
    scope: NotebookScope,
): Promise<NotebookSummary[]> {
    if (scope === "mine") {
        const workspaces = await findOwnedWorkspacesWithOwner(userId);
        const counts = await countMembersByWorkspaceIds(
            workspaces.map((workspace) => workspace.id),
        );

        return workspaces.map((workspace) =>
            toSummary(workspace, "OWNER", (counts.get(workspace.id) ?? 0) + 1),
        );
    }

    const memberships = await findSharedWorkspacesForUser(userId);
    const counts = await countMembersByWorkspaceIds(
        memberships.map((membership) => membership.workspace.id),
    );

    return memberships.map((membership) =>
        toSummary(
            membership.workspace,
            membership.role,
            (counts.get(membership.workspace.id) ?? 0) + 1,
        ),
    );
}

/**
 * Loads everything the share dialog renders in one request.
 *
 * Members are visible to everyone who can see the notebook; pending invitations
 * and the share link are not, because they are the owner's tools for deciding
 * who gets in, and a viewer has no use for a list of people who have not
 * accepted yet.
 *
 * @param workspaceId - Notebook to describe
 * @param userId - Authenticated user's id
 * @returns The notebook's sharing state from this reader's point of view
 */
export async function getNotebookSharing(
    workspaceId: string,
    userId: string,
): Promise<NotebookSharing> {
    const access = await authorizeNotebook(workspaceId, userId, "member:read");
    const workspace = await findWorkspaceWithOwnerById(workspaceId);

    if (!workspace) {
        throw new NotFoundError("Notebook not found");
    }

    const memberRows = await findNotebookMembersWithUsers(workspaceId);
    const members: NotebookMember[] = [
        ownerMember(workspace),
        ...memberRows.map((row) => ({
            userId: row.user.id,
            name: row.user.name,
            email: row.user.email,
            image: row.user.image,
            role: row.role,
            joinedAt: row.createdAt.toISOString(),
            invitedByUserId: row.invitedById,
        })),
    ];

    const isOwner = access.role === "OWNER";
    const now = new Date();
    const invitationRows = isOwner
        ? await findPendingInvitationsByWorkspaceId(workspaceId)
        : [];
    const shareLinkRecord = isOwner
        ? await findShareLinkByWorkspaceId(workspaceId)
        : null;

    return {
        version: 1,
        workspaceId,
        viewerUserId: userId,
        role: access.role,
        audience: members.length > 1 ? "shared" : "private",
        members,
        invitations: invitationRows.map(toInvitation),
        shareLink: shareLinkRecord ? toShareLink(shareLinkRecord, now) : null,
    };
}

/**
 * Invites one email address to a notebook.
 *
 * There is no mail provider in this deployment, so the invitation link is
 * returned to the inviter to deliver. That is why it is bound to the invited
 * address: a forwarded invitation cannot be redeemed by whoever received it, only
 * by the person it names.
 *
 * @param workspaceId - Notebook to invite into
 * @param actor - The inviting user
 * @param input - Invited address and role
 * @returns The invitation and its one-time link
 * @throws {ConflictError} When the address already has access or a live invitation
 */
export async function inviteMemberToNotebook(
    workspaceId: string,
    actor: Actor,
    input: InviteMemberRequest,
): Promise<CreatedInvitation> {
    const access = await authorizeNotebook(
        workspaceId,
        actor.id,
        "member:manage",
    );

    if (input.email === actor.email.trim().toLowerCase()) {
        throw new ConflictError("You already own this notebook.");
    }

    const existingUsers = await findUsersByEmail(input.email);
    for (const user of existingUsers) {
        if (user.id === access.ownerId) {
            throw new ConflictError("That person already owns this notebook.");
        }
        const membership = await findNotebookMember(workspaceId, user.id);
        if (membership) {
            throw new ConflictError(
                "That person already has access to this notebook.",
            );
        }
    }

    const duplicate = await findPendingInvitationForEmail(
        workspaceId,
        input.email,
    );
    if (duplicate) {
        throw new ConflictError(
            "That address already has an invitation waiting. Revoke it first to send a new link.",
        );
    }

    const memberCount = await countNotebookMembers(workspaceId);
    if (memberCount >= NOTEBOOK_MEMBER_MAX) {
        throw new ConflictError(
            `A notebook can be shared with up to ${NOTEBOOK_MEMBER_MAX} people.`,
        );
    }

    const pendingCount = await countPendingInvitations(workspaceId);
    if (pendingCount >= NOTEBOOK_PENDING_INVITATION_MAX) {
        throw new ConflictError(
            "This notebook has too many invitations waiting. Revoke one before sending another.",
        );
    }

    const token = generateShareToken();
    const record = await createInvitationRecord({
        workspaceId,
        email: input.email,
        role: input.role,
        tokenHash: hashShareToken(token),
        expiresAt: expiryFromNow(INVITATION_TTL_DAYS, new Date()),
        invitedById: actor.id,
    });

    await recordAuditEvent({
        workspaceId,
        type: "MEMBER_INVITED",
        actor,
        context: { targetEmail: input.email, toRole: input.role },
    });

    return { invitation: toInvitation(record), inviteUrl: inviteUrl(token) };
}

/**
 * Withdraws an invitation that has not been redeemed.
 *
 * @param workspaceId - Notebook the invitation belongs to
 * @param actor - The revoking user
 * @param invitationId - Invitation to withdraw
 * @returns Resolves once the invitation can no longer be redeemed
 * @throws {NotFoundError} When there is no pending invitation with that id
 */
export async function revokeInvitation(
    workspaceId: string,
    actor: Actor,
    invitationId: string,
): Promise<void> {
    await authorizeNotebook(workspaceId, actor.id, "member:manage");

    const invitation = await findInvitationByIdAndWorkspaceId(
        invitationId,
        workspaceId,
    );

    if (!invitation) {
        throw new NotFoundError("Invitation not found");
    }

    const revoked = await markInvitationRevoked(
        invitationId,
        workspaceId,
        new Date(),
    );

    if (!revoked) {
        throw new ConflictError(
            "That invitation was already accepted or revoked.",
        );
    }

    await recordAuditEvent({
        workspaceId,
        type: "INVITATION_REVOKED",
        actor,
        context: { targetEmail: invitation.email },
    });
}

/**
 * Redeems an invitation link.
 *
 * The invitation is matched by the hash of the presented token, checked against
 * the redeemer's verified email, and marked accepted with a status guard that
 * makes the redemption single-use even under concurrent clicks.
 *
 * @param token - Token from the invitation link
 * @param actor - The user redeeming it
 * @returns The notebook they joined and the role they hold
 * @throws {ShareRejectedError} When the link is invalid, expired, revoked, meant
 * for a different account, already redeemed, or the notebook is full
 */
export async function acceptInvitation(
    token: string,
    actor: Actor,
): Promise<AcceptShareResponse> {
    const invitation = await findInvitationByTokenHash(hashShareToken(token));

    if (!invitation) {
        throw new ShareRejectedError("INVALID");
    }

    const now = new Date();
    const rejection = invitationRejectionReason(invitation, now);
    if (rejection) {
        throw new ShareRejectedError(rejection);
    }

    if (invitation.email !== actor.email.trim().toLowerCase()) {
        throw new ShareRejectedError("WRONG_ACCOUNT");
    }

    const workspace = await findWorkspaceWithOwnerById(invitation.workspaceId);
    if (!workspace) {
        throw new ShareRejectedError("INVALID");
    }

    if (workspace.userId === actor.id) {
        throw new ShareRejectedError("ALREADY_MEMBER");
    }

    const existing = await findNotebookMember(invitation.workspaceId, actor.id);
    if (existing) {
        throw new ShareRejectedError("ALREADY_MEMBER");
    }

    const memberCount = await countNotebookMembers(invitation.workspaceId);
    if (memberCount >= NOTEBOOK_MEMBER_MAX) {
        throw new ShareRejectedError("NOTEBOOK_FULL");
    }

    const accepted = await markInvitationAccepted(invitation.id, actor.id, now);
    if (!accepted) {
        throw new ShareRejectedError("INVALID");
    }

    await upsertNotebookMember({
        workspaceId: invitation.workspaceId,
        userId: actor.id,
        role: invitation.role,
        invitedById: invitation.invitedById,
    });

    await recordAuditEvent({
        workspaceId: invitation.workspaceId,
        type: "INVITATION_ACCEPTED",
        actor,
        context: { targetUserId: actor.id, toRole: invitation.role },
    });

    return {
        workspaceId: workspace.id,
        workspaceTitle: workspace.title,
        role: invitation.role,
    };
}

/**
 * Changes what an existing member can do.
 *
 * @param workspaceId - Notebook the membership belongs to
 * @param actor - The owner making the change
 * @param targetUserId - Member whose role is changing
 * @param role - New role
 * @returns The member's new role
 * @throws {NotFoundError} When that user is not a member
 */
export async function updateNotebookMemberRoleForOwner(
    workspaceId: string,
    actor: Actor,
    targetUserId: string,
    role: NotebookMemberRole,
): Promise<NotebookMemberRole> {
    const access = await authorizeNotebook(
        workspaceId,
        actor.id,
        "member:manage",
    );

    if (targetUserId === access.ownerId) {
        throw new ValidationError(
            "The notebook owner's role cannot be changed. Transfer ownership instead.",
        );
    }

    const existing = await findNotebookMember(workspaceId, targetUserId);
    if (!existing) {
        throw new NotFoundError("That person is not a member of this notebook");
    }

    const updated = await updateNotebookMemberRole(
        workspaceId,
        targetUserId,
        role,
    );
    if (!updated) {
        throw new NotFoundError("That person is not a member of this notebook");
    }

    await recordAuditEvent({
        workspaceId,
        type: "MEMBER_ROLE_CHANGED",
        actor,
        context: {
            targetUserId,
            fromRole: existing.role,
            toRole: role,
        },
    });

    return updated.role;
}

/**
 * Removes someone's access.
 *
 * The membership row is deleted rather than flagged, and authorization reads
 * membership on every request, so the removed user loses access on their next
 * call with no session to expire.
 *
 * @param workspaceId - Notebook to remove them from
 * @param actor - The owner making the removal
 * @param targetUserId - Member losing access
 * @returns Resolves once access is gone
 */
export async function removeNotebookMember(
    workspaceId: string,
    actor: Actor,
    targetUserId: string,
): Promise<void> {
    const access = await authorizeNotebook(
        workspaceId,
        actor.id,
        "member:manage",
    );

    if (targetUserId === access.ownerId) {
        throw new ValidationError(
            "The notebook owner cannot be removed. Transfer ownership first.",
        );
    }

    const removed = await deleteNotebookMember(workspaceId, targetUserId);
    if (!removed) {
        throw new NotFoundError("That person is not a member of this notebook");
    }

    await recordAuditEvent({
        workspaceId,
        type: "MEMBER_REMOVED",
        actor,
        context: { targetUserId },
    });
}

/**
 * Gives up your own access to someone else's notebook.
 *
 * Distinct from removal because it needs no `member:manage`: everyone may leave,
 * and only the owner cannot — they have nothing to leave, and must transfer or
 * delete instead.
 *
 * @param workspaceId - Notebook to leave
 * @param actor - The departing member
 * @returns Resolves once their access is gone
 */
export async function leaveNotebook(
    workspaceId: string,
    actor: Actor,
): Promise<void> {
    const access = await authorizeNotebook(
        workspaceId,
        actor.id,
        "notebook:read",
    );

    if (access.role === "OWNER") {
        throw new ValidationError(
            "You own this notebook. Transfer it to someone else or delete it.",
        );
    }

    const removed = await deleteNotebookMember(workspaceId, actor.id);
    if (!removed) {
        throw new NotFoundError("You are not a member of this notebook");
    }

    await recordAuditEvent({
        workspaceId,
        type: "MEMBER_LEFT",
        actor,
        context: { targetUserId: actor.id, fromRole: access.role },
    });
}

/**
 * Hands a notebook to one of its members.
 *
 * The outgoing owner keeps editor access, so transferring is not a way to lose a
 * notebook by accident. The swap runs in a single transaction; see
 * `transferWorkspaceOwnership` for why its order is fixed.
 *
 * @param workspaceId - Notebook changing hands
 * @param actor - The current owner
 * @param targetUserId - Member receiving the notebook
 * @returns Resolves once ownership has moved
 * @throws {NotFoundError} When the recipient is not already a member
 */
export async function transferNotebookOwnership(
    workspaceId: string,
    actor: Actor,
    targetUserId: string,
): Promise<void> {
    const access = await authorizeNotebook(
        workspaceId,
        actor.id,
        "notebook:transfer",
    );

    if (targetUserId === access.ownerId) {
        throw new ValidationError("You already own this notebook.");
    }

    const membership = await findNotebookMember(workspaceId, targetUserId);
    if (!membership) {
        throw new NotFoundError(
            "You can only transfer a notebook to someone who already has access",
        );
    }

    await transferWorkspaceOwnership(workspaceId, access.ownerId, targetUserId);

    await recordAuditEvent({
        workspaceId,
        type: "OWNERSHIP_TRANSFERRED",
        actor,
        context: {
            targetUserId,
            fromRole: "OWNER",
            toRole: "EDITOR",
        },
    });
}

/**
 * Turns link sharing on, or rotates the link that is already on.
 *
 * Both are the same operation because a notebook holds at most one link: after
 * rotating, every previously forwarded copy is dead.
 *
 * @param workspaceId - Notebook to share
 * @param actor - The owner enabling sharing
 * @param input - Requested lifetime in days
 * @returns The link's state and its one-time URL
 */
export async function createNotebookShareLink(
    workspaceId: string,
    actor: Actor,
    input: CreateShareLinkRequest,
): Promise<CreatedShareLink> {
    await authorizeNotebook(workspaceId, actor.id, "share:manage");

    const token = generateShareToken();
    const record = await upsertShareLinkRecord({
        workspaceId,
        tokenHash: hashShareToken(token),
        expiresAt: expiryFromNow(input.expiresInDays, new Date()),
        createdById: actor.id,
    });

    const shareLink = toShareLink(record, new Date());
    if (!shareLink) {
        throw new ConflictError("The share link could not be created.");
    }

    await recordAuditEvent({
        workspaceId,
        type: "SHARE_LINK_CREATED",
        actor,
        context: { targetResourceId: record.id, toRole: "VIEWER" },
    });

    return { shareLink, shareUrl: shareUrl(token) };
}

/**
 * Turns link sharing off.
 *
 * People who already joined through the link keep their access: they are members
 * now, and removing them is a separate, deliberate act.
 *
 * @param workspaceId - Notebook to stop sharing by link
 * @param actor - The owner revoking it
 * @returns Resolves once the link can no longer be redeemed
 */
export async function revokeNotebookShareLink(
    workspaceId: string,
    actor: Actor,
): Promise<void> {
    await authorizeNotebook(workspaceId, actor.id, "share:manage");

    const revoked = await revokeShareLinkRecord(workspaceId, new Date());
    if (!revoked) {
        throw new NotFoundError("This notebook has no active share link");
    }

    await recordAuditEvent({
        workspaceId,
        type: "SHARE_LINK_REVOKED",
        actor,
    });
}

/**
 * Joins a notebook through a share link.
 *
 * The joiner must be signed in. Anonymous access would mean a notebook's sources
 * and answers could be read by someone the owner can neither see in the member
 * list nor remove, which is not a form of sharing this product offers.
 *
 * @param token - Token from the share link
 * @param actor - The user joining
 * @returns The notebook they joined and the role they hold
 * @throws {ShareRejectedError} When the link is invalid, expired, revoked, or the
 * notebook is full
 */
export async function acceptShareLink(
    token: string,
    actor: Actor,
): Promise<AcceptShareResponse> {
    const record = await findShareLinkByTokenHash(hashShareToken(token));

    if (!record) {
        throw new ShareRejectedError("INVALID");
    }

    const now = new Date();
    const rejection = shareLinkRejectionReason(record, now);
    if (rejection) {
        throw new ShareRejectedError(rejection);
    }

    const workspace = await findWorkspaceWithOwnerById(record.workspaceId);
    if (!workspace) {
        throw new ShareRejectedError("INVALID");
    }

    if (workspace.userId === actor.id) {
        throw new ShareRejectedError("ALREADY_MEMBER");
    }

    const existing = await findNotebookMember(record.workspaceId, actor.id);
    if (existing) {
        throw new ShareRejectedError("ALREADY_MEMBER");
    }

    const memberCount = await countNotebookMembers(record.workspaceId);
    if (memberCount >= NOTEBOOK_MEMBER_MAX) {
        throw new ShareRejectedError("NOTEBOOK_FULL");
    }

    const joined = await recordShareLinkJoin(record.id, now);
    if (!joined) {
        throw new ShareRejectedError("REVOKED");
    }

    await upsertNotebookMember({
        workspaceId: record.workspaceId,
        userId: actor.id,
        role: "VIEWER",
        invitedById: null,
    });

    await recordAuditEvent({
        workspaceId: record.workspaceId,
        type: "SHARE_LINK_JOINED",
        actor,
        context: { targetUserId: actor.id, toRole: "VIEWER" },
    });

    return {
        workspaceId: workspace.id,
        workspaceTitle: workspace.title,
        role: "VIEWER",
    };
}
