"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    cancelOutput,
    createOutput,
    deleteOutput,
    duplicateOutput,
    getOutput,
    listOutputs,
    regenerateOutput,
    renameOutput,
} from "../lib/api";
import { isOutputGenerating, type CreateOutputInput } from "../lib/types";

const GENERATING_POLL_INTERVAL_MS = 3000;

export function outputKeys(workspaceId: string) {
    return {
        all: ["outputs", workspaceId] as const,
        list: () => ["outputs", workspaceId, "list"] as const,
        detail: (outputId: string) =>
            ["outputs", workspaceId, outputId] as const,
    };
}

export function useOutputs(workspaceId: string) {
    return useQuery({
        queryKey: outputKeys(workspaceId).list(),
        queryFn: () => listOutputs(workspaceId),
        refetchInterval: (query) =>
            query.state.data?.some((output) => isOutputGenerating(output.status))
                ? GENERATING_POLL_INTERVAL_MS
                : false,
    });
}

export function useOutput(workspaceId: string, outputId: string) {
    return useQuery({
        queryKey: outputKeys(workspaceId).detail(outputId),
        queryFn: () => getOutput(workspaceId, outputId),
        refetchInterval: (query) => {
            const status = query.state.data?.status;
            return status && isOutputGenerating(status)
                ? GENERATING_POLL_INTERVAL_MS
                : false;
        },
    });
}

export function useCreateOutput(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: CreateOutputInput) =>
            createOutput(workspaceId, input),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: outputKeys(workspaceId).all,
            });
        },
    });
}

export function useRenameOutput(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            outputId,
            title,
        }: {
            outputId: string;
            title: string;
        }) => renameOutput(workspaceId, outputId, title),
        onSuccess: (output) => {
            queryClient.setQueryData(
                outputKeys(workspaceId).detail(output.id),
                output,
            );
            void queryClient.invalidateQueries({
                queryKey: outputKeys(workspaceId).all,
            });
        },
    });
}

export function useRegenerateOutput(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (outputId: string) =>
            regenerateOutput(workspaceId, outputId),
        onSuccess: (output) => {
            queryClient.setQueryData(
                outputKeys(workspaceId).detail(output.id),
                output,
            );
            void queryClient.invalidateQueries({
                queryKey: outputKeys(workspaceId).all,
            });
        },
    });
}

export function useDuplicateOutput(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (outputId: string) => duplicateOutput(workspaceId, outputId),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: outputKeys(workspaceId).all,
            });
        },
    });
}

export function useCancelOutput(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (outputId: string) => cancelOutput(workspaceId, outputId),
        onSuccess: (output) => {
            queryClient.setQueryData(
                outputKeys(workspaceId).detail(output.id),
                output,
            );
            void queryClient.invalidateQueries({
                queryKey: outputKeys(workspaceId).all,
            });
        },
    });
}

export function useDeleteOutput(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (outputId: string) => deleteOutput(workspaceId, outputId),
        onSuccess: (_result, outputId) => {
            queryClient.removeQueries({
                queryKey: outputKeys(workspaceId).detail(outputId),
            });
            void queryClient.invalidateQueries({
                queryKey: outputKeys(workspaceId).all,
            });
        },
    });
}
