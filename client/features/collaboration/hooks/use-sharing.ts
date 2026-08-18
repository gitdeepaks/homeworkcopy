"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
    CreateShareLinkRequestInput,
    InviteMemberRequest,
    NotebookMemberRole,
} from "@homeworkcopy/contracts";
import { workspaceKeys } from "@/features/workspaces/hooks/use-workspaces";
import {
    createShareLink,
    getNotebookSharing,
    inviteMember,
    leaveNotebook,
    listNotebookActivity,
    removeMember,
    revokeInvitation,
    revokeShareLink,
    transferOwnership,
    updateMemberRole,
} from "../lib/api";

export function sharingKeys(workspaceId: string) {
    return {
        all: ["sharing", workspaceId] as const,
        activity: ["sharing", workspaceId, "activity"] as const,
    };
}

export function useNotebookSharing(workspaceId: string, enabled = true) {
    return useQuery({
        queryKey: sharingKeys(workspaceId).all,
        queryFn: () => getNotebookSharing(workspaceId),
        enabled,
    });
}

export function useNotebookActivity(workspaceId: string, enabled = true) {
    return useQuery({
        queryKey: sharingKeys(workspaceId).activity,
        queryFn: () => listNotebookActivity(workspaceId),
        enabled,
    });
}

/**
 * Refreshes everything a membership change can alter.
 *
 * Both dashboard tabs are invalidated, not just the one in view: promoting
 * someone changes the Shared tab for them and the member count on the owner's
 * card, and a stale count is exactly the kind of thing that makes sharing feel
 * unreliable.
 */
function useSharingInvalidation(workspaceId: string) {
    const queryClient = useQueryClient();

    return () => {
        void queryClient.invalidateQueries({
            queryKey: sharingKeys(workspaceId).all,
        });
        void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
        void queryClient.invalidateQueries({
            queryKey: workspaceKeys.detail(workspaceId),
        });
    };
}

export function useInviteMember(workspaceId: string) {
    const invalidate = useSharingInvalidation(workspaceId);

    return useMutation({
        mutationFn: (input: InviteMemberRequest) =>
            inviteMember(workspaceId, input),
        onSuccess: invalidate,
    });
}

export function useRevokeInvitation(workspaceId: string) {
    const invalidate = useSharingInvalidation(workspaceId);

    return useMutation({
        mutationFn: (invitationId: string) =>
            revokeInvitation(workspaceId, invitationId),
        onSuccess: invalidate,
    });
}

export function useUpdateMemberRole(workspaceId: string) {
    const invalidate = useSharingInvalidation(workspaceId);

    return useMutation({
        mutationFn: (input: { userId: string; role: NotebookMemberRole }) =>
            updateMemberRole(workspaceId, input.userId, input.role),
        onSuccess: invalidate,
    });
}

export function useRemoveMember(workspaceId: string) {
    const invalidate = useSharingInvalidation(workspaceId);

    return useMutation({
        mutationFn: (userId: string) => removeMember(workspaceId, userId),
        onSuccess: invalidate,
    });
}

export function useLeaveNotebook(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: () => leaveNotebook(workspaceId),
        onSuccess: () => {
            // The notebook is gone from this user's world, so its cached
            // entries are removed rather than refetched into a 404.
            queryClient.removeQueries({
                queryKey: sharingKeys(workspaceId).all,
            });
            queryClient.removeQueries({
                queryKey: workspaceKeys.detail(workspaceId),
            });
            void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
        },
    });
}

export function useTransferOwnership(workspaceId: string) {
    const invalidate = useSharingInvalidation(workspaceId);

    return useMutation({
        mutationFn: (userId: string) => transferOwnership(workspaceId, userId),
        onSuccess: invalidate,
    });
}

export function useCreateShareLink(workspaceId: string) {
    const invalidate = useSharingInvalidation(workspaceId);

    return useMutation({
        mutationFn: (input: CreateShareLinkRequestInput = {}) =>
            createShareLink(workspaceId, input),
        onSuccess: invalidate,
    });
}

export function useRevokeShareLink(workspaceId: string) {
    const invalidate = useSharingInvalidation(workspaceId);

    return useMutation({
        mutationFn: () => revokeShareLink(workspaceId),
        onSuccess: invalidate,
    });
}
