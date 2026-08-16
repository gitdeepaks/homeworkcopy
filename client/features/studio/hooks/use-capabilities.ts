"use client";

import { useQuery } from "@tanstack/react-query";
import { studioCapabilitiesSchema } from "@homeworkcopy/contracts";
import { apiFetchWithSchema } from "@/shared/lib/api";

/** Deployment configuration changes rarely; one fetch per session is enough. */
const CAPABILITIES_STALE_TIME_MS = 30 * 60_000;

export const capabilityKeys = {
    all: ["capabilities"] as const,
};

/**
 * Which optional Studio tools this deployment can actually deliver.
 *
 * Used to disable — and explain — a tool whose providers are not configured,
 * rather than letting the reader submit a request that must fail.
 */
export function useStudioCapabilities() {
    return useQuery({
        queryKey: capabilityKeys.all,
        queryFn: () =>
            apiFetchWithSchema("/api/capabilities", studioCapabilitiesSchema),
        staleTime: CAPABILITIES_STALE_TIME_MS,
    });
}
