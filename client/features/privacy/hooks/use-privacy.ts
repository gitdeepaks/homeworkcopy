"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
    CreateExportRequest,
    UpdatePrivacyPreferences,
} from "@homeworkcopy/contracts";
import {
    createExport,
    deleteAccount,
    getDeletionPreview,
    getPrivacyDisclosure,
    getPrivacySettings,
    listExports,
    updatePrivacyPreferences,
} from "../lib/api";

export const privacyKeys = {
    all: ["privacy"] as const,
    settings: () => ["privacy", "settings"] as const,
    disclosure: () => ["privacy", "disclosure"] as const,
    exports: () => ["privacy", "exports"] as const,
    deletionPreview: () => ["privacy", "deletion", "preview"] as const,
};

export function usePrivacySettings() {
    return useQuery({
        queryKey: privacyKeys.settings(),
        queryFn: getPrivacySettings,
    });
}

/**
 * The disclosure, which depends on the reader's current choices.
 *
 * Invalidated together with the settings on every preference change, because
 * turning a provider off has to remove it from the list of who receives data —
 * a disclosure that lags the toggle beside it is worse than none.
 */
export function usePrivacyDisclosure() {
    return useQuery({
        queryKey: privacyKeys.disclosure(),
        queryFn: getPrivacyDisclosure,
    });
}

export function useUpdatePrivacyPreferences() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: UpdatePrivacyPreferences) =>
            updatePrivacyPreferences(input),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: privacyKeys.all });
            // Memory lives behind this consent, so its list becomes stale the
            // moment the switch moves.
            void queryClient.invalidateQueries({ queryKey: ["memory"] });
        },
    });
}

/** How often a pending export is re-checked while it builds. */
const EXPORT_POLL_MS = 4_000;

/**
 * The reader's exports, polled only while one is still being built.
 *
 * Polling stops as soon as nothing is pending, so an idle settings page makes no
 * requests at all.
 */
export function useExports() {
    return useQuery({
        queryKey: privacyKeys.exports(),
        queryFn: listExports,
        refetchInterval: (query) => {
            const pending = query.state.data?.some(
                (record) =>
                    record.status === "PENDING" || record.status === "PROCESSING",
            );
            return pending === true ? EXPORT_POLL_MS : false;
        },
    });
}

export function useCreateExport() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: CreateExportRequest) => createExport(input),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: privacyKeys.exports(),
            });
        },
    });
}

export function useDeletionPreview() {
    return useQuery({
        queryKey: privacyKeys.deletionPreview(),
        queryFn: getDeletionPreview,
    });
}

export function useDeleteAccount() {
    return useMutation({ mutationFn: deleteAccount });
}
