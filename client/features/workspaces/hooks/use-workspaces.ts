"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotebookScope } from "@homeworkcopy/contracts";
import { ApiError } from "@/shared/lib/api";
import {
    createWorkspace,
    deleteWorkspace,
    getWorkspace,
    listWorkspaces,
    updateWorkspace,
} from "../lib/api";
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from "../lib/types";

export const workspaceKeys = {
    /** Everything list-shaped, so one invalidation refreshes both tabs. */
    all: ["workspaces"] as const,
    list: (scope: NotebookScope) => ["workspaces", "list", scope] as const,
    detail: (id: string) => ["workspaces", id] as const,
};

/**
 * Lists the notebooks in one dashboard tab.
 *
 * @param scope - `mine` for owned notebooks, `shared` for ones shared with you
 */
export function useWorkspaces(scope: NotebookScope = "mine") {
    return useQuery({
        queryKey: workspaceKeys.list(scope),
        queryFn: () => listWorkspaces(scope),
    });
}

export function useWorkspace(id: string) {
    return useQuery({
        queryKey: workspaceKeys.detail(id),
        queryFn: () => getWorkspace(id),
        // A notebook that is gone, or that this reader was just removed from,
        // answers 404 and will keep doing so. Retrying only delays the message.
        retry: (_, error) =>
            !(error instanceof ApiError && error.status === 404),
    });
}

export function useCreateWorkspace() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: CreateWorkspaceInput) => createWorkspace(input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
        },
    });
}

export function useUpdateWorkspace(id: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: UpdateWorkspaceInput) => updateWorkspace(id, input),
        onSuccess: (workspace) => {
            queryClient.setQueryData(workspaceKeys.detail(id), workspace);
            void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
        },
    });
}

export function useDeleteWorkspace() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => deleteWorkspace(id),
        onSuccess: (_, id) => {
            queryClient.removeQueries({ queryKey: workspaceKeys.detail(id) });
            void queryClient.invalidateQueries({ queryKey: workspaceKeys.all });
        },
    });
}
