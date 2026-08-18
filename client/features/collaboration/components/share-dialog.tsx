"use client";

import { useState } from "react";
import type {
    NotebookInvitation,
    NotebookMember,
    NotebookMemberRole,
} from "@homeworkcopy/contracts";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/shared/lib/api";
import {
    useNotebookActivity,
    useNotebookSharing,
    useRemoveMember,
    useRevokeInvitation,
    useTransferOwnership,
    useUpdateMemberRole,
} from "../hooks/use-sharing";
import { can } from "../lib/permissions";
import { ActivityList } from "./activity-list";
import { InviteForm } from "./invite-form";
import { MemberList } from "./member-list";
import { PendingInvitations } from "./pending-invitations";
import { ShareLinkPanel } from "./share-link-panel";

type ShareDialogProps = {
    workspaceId: string;
    notebookTitle: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

type Confirmation =
    | { kind: "remove"; member: NotebookMember }
    | { kind: "transfer"; member: NotebookMember };

/**
 * Everything about who can reach this notebook, in one place.
 *
 * The dialog renders from the reader's own role rather than from a guess: an
 * editor sees the member list and nothing else, because inviting, sharing, and
 * the activity trail are the owner's to control and the server would refuse them
 * anyway.
 */
export function ShareDialog({
    workspaceId,
    notebookTitle,
    open,
    onOpenChange,
}: ShareDialogProps) {
    const sharing = useNotebookSharing(workspaceId, open);
    const role = sharing.data?.role;
    const canManageMembers = can(role, "member:manage");
    const canManageSharing = can(role, "share:manage");
    const canReadActivity = can(role, "audit:read");

    const activity = useNotebookActivity(workspaceId, open && canReadActivity);
    const updateRole = useUpdateMemberRole(workspaceId);
    const removeMember = useRemoveMember(workspaceId);
    const revokeInvitation = useRevokeInvitation(workspaceId);
    const transferOwnership = useTransferOwnership(workspaceId);

    const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
    const [pendingUserId, setPendingUserId] = useState<string | null>(null);
    const [pendingInvitationId, setPendingInvitationId] = useState<
        string | null
    >(null);

    const mutationError = [
        updateRole.error,
        removeMember.error,
        revokeInvitation.error,
        transferOwnership.error,
    ].find((error): error is ApiError => error instanceof ApiError);

    function changeRole(userId: string, nextRole: NotebookMemberRole) {
        setPendingUserId(userId);
        void updateRole
            .mutateAsync({ userId, role: nextRole })
            .catch(() => undefined)
            .finally(() => setPendingUserId(null));
    }

    function revoke(invitation: NotebookInvitation) {
        setPendingInvitationId(invitation.id);
        void revokeInvitation
            .mutateAsync(invitation.id)
            .catch(() => undefined)
            .finally(() => setPendingInvitationId(null));
    }

    function confirm() {
        if (!confirmation) return;

        const action =
            confirmation.kind === "remove"
                ? removeMember.mutateAsync(confirmation.member.userId)
                : transferOwnership.mutateAsync(confirmation.member.userId);

        setPendingUserId(confirmation.member.userId);
        void action
            .then(() => setConfirmation(null))
            .catch(() => undefined)
            .finally(() => setPendingUserId(null));
    }

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Share “{notebookTitle}”</DialogTitle>
                        <DialogDescription>
                            {sharing.data?.audience === "shared"
                                ? "This notebook is shared. Everyone below can open it."
                                : "This notebook is private. Only you can open it."}
                        </DialogDescription>
                    </DialogHeader>

                    {sharing.isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-12 rounded-md" />
                            <Skeleton className="h-12 rounded-md" />
                        </div>
                    ) : sharing.error ? (
                        <p role="alert" className="text-sm text-destructive">
                            {sharing.error instanceof ApiError
                                ? sharing.error.message
                                : "Sharing could not be loaded."}
                        </p>
                    ) : sharing.data ? (
                        <Tabs defaultValue="people" className="space-y-4">
                            <TabsList>
                                <TabsTrigger
                                    value="people"
                                    className="min-h-11 px-4"
                                >
                                    People
                                </TabsTrigger>
                                {canManageSharing ? (
                                    <TabsTrigger
                                        value="link"
                                        className="min-h-11 px-4"
                                    >
                                        Link
                                    </TabsTrigger>
                                ) : null}
                                {canReadActivity ? (
                                    <TabsTrigger
                                        value="activity"
                                        className="min-h-11 px-4"
                                    >
                                        Activity
                                    </TabsTrigger>
                                ) : null}
                            </TabsList>

                            <TabsContent value="people" className="space-y-4">
                                {canManageMembers ? (
                                    <InviteForm workspaceId={workspaceId} />
                                ) : null}

                                <MemberList
                                    members={sharing.data.members}
                                    canManage={canManageMembers}
                                    currentUserId={
                                        sharing.data.viewerUserId
                                    }
                                    pendingUserId={pendingUserId}
                                    onChangeRole={changeRole}
                                    onRemove={(member) =>
                                        setConfirmation({
                                            kind: "remove",
                                            member,
                                        })
                                    }
                                    onTransfer={(member) =>
                                        setConfirmation({
                                            kind: "transfer",
                                            member,
                                        })
                                    }
                                />

                                <PendingInvitations
                                    invitations={sharing.data.invitations}
                                    pendingId={pendingInvitationId}
                                    onRevoke={revoke}
                                />

                                {mutationError ? (
                                    <p
                                        role="alert"
                                        className="text-sm text-destructive"
                                    >
                                        {mutationError.message}
                                    </p>
                                ) : null}
                            </TabsContent>

                            {canManageSharing ? (
                                <TabsContent value="link">
                                    <ShareLinkPanel
                                        workspaceId={workspaceId}
                                        shareLink={sharing.data.shareLink}
                                    />
                                </TabsContent>
                            ) : null}

                            {canReadActivity ? (
                                <TabsContent value="activity">
                                    <ActivityList
                                        events={activity.data}
                                        isLoading={activity.isLoading}
                                    />
                                </TabsContent>
                            ) : null}
                        </Tabs>
                    ) : null}
                </DialogContent>
            </Dialog>

            <AlertDialog
                open={confirmation !== null}
                onOpenChange={(next) => {
                    if (!next) setConfirmation(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmation?.kind === "transfer"
                                ? "Make this person the owner?"
                                : "Remove this person?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmation?.kind === "transfer" ? (
                                <>
                                    {confirmation.member.name} will own this
                                    notebook and control who can reach it. You
                                    will stay on as an editor.
                                </>
                            ) : confirmation ? (
                                <>
                                    {confirmation.member.name} will lose access
                                    immediately. Anything they added stays in the
                                    notebook.
                                </>
                            ) : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={pendingUserId !== null}>
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            variant={
                                confirmation?.kind === "transfer"
                                    ? "default"
                                    : "destructive"
                            }
                            disabled={pendingUserId !== null}
                            onClick={(event) => {
                                event.preventDefault();
                                confirm();
                            }}
                        >
                            {pendingUserId !== null ? <Spinner /> : null}
                            {confirmation?.kind === "transfer"
                                ? "Transfer ownership"
                                : "Remove"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
