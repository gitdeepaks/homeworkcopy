"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    cancelOutput,
    createOutput,
    deleteOutput,
    duplicateOutput,
    getOutput,
    getOutputAudio,
    listOutputs,
    regenerateOutput,
    renameOutput,
} from "../lib/api";
import { isOutputGenerating, type CreateOutputInput } from "../lib/types";

const GENERATING_POLL_INTERVAL_MS = 3000;

/**
 * Signed audio URLs are refetched a minute before they expire, so playback that
 * outlives one signature keeps working without the reader noticing.
 */
const AUDIO_URL_REFRESH_MARGIN_MS = 60_000;

/** Floor for the refresh timer, so a short-lived signature cannot spin it. */
const AUDIO_URL_MIN_REFRESH_MS = 30_000;

export function outputKeys(workspaceId: string) {
    return {
        all: ["outputs", workspaceId] as const,
        list: () => ["outputs", workspaceId, "list"] as const,
        detail: (outputId: string) =>
            ["outputs", workspaceId, outputId] as const,
        audio: (outputId: string) =>
            ["outputs", workspaceId, outputId, "audio"] as const,
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

/**
 * Signed playback and download URLs for a ready Audio Overview.
 *
 * @param workspaceId - Notebook the output belongs to
 * @param outputId - Audio Overview to play
 * @param enabled - Whether the output actually has media yet
 */
export function useOutputAudio(
    workspaceId: string,
    outputId: string,
    enabled: boolean,
) {
    return useQuery({
        queryKey: outputKeys(workspaceId).audio(outputId),
        queryFn: () => getOutputAudio(workspaceId, outputId),
        enabled,
        // A signed URL is only valid until it expires, so it must never be
        // served from cache after that point.
        staleTime: 0,
        gcTime: 0,
        refetchInterval: (query) => {
            const expiresAt = query.state.data?.expiresAt;
            if (!expiresAt) {
                return false;
            }
            const remaining =
                new Date(expiresAt).getTime() -
                Date.now() -
                AUDIO_URL_REFRESH_MARGIN_MS;
            return Math.max(remaining, AUDIO_URL_MIN_REFRESH_MS);
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
