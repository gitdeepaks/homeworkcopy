import { apiFetch, apiFetchVoid } from "@/shared/lib/api";
import type { CreateOutputInput, StudioOutput } from "./types";

function outputsPath(workspaceId: string) {
    return `/api/workspaces/${workspaceId}/artifacts`;
}

export function listOutputs(workspaceId: string) {
    return apiFetch<StudioOutput[]>(outputsPath(workspaceId));
}

export function getOutput(workspaceId: string, outputId: string) {
    return apiFetch<StudioOutput>(`${outputsPath(workspaceId)}/${outputId}`);
}

export function createOutput(workspaceId: string, input: CreateOutputInput) {
    return apiFetch<StudioOutput>(outputsPath(workspaceId), {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function renameOutput(
    workspaceId: string,
    outputId: string,
    title: string,
) {
    return apiFetch<StudioOutput>(`${outputsPath(workspaceId)}/${outputId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
    });
}

export function regenerateOutput(workspaceId: string, outputId: string) {
    return apiFetch<StudioOutput>(
        `${outputsPath(workspaceId)}/${outputId}/regenerate`,
        { method: "POST" },
    );
}

export function duplicateOutput(workspaceId: string, outputId: string) {
    return apiFetch<StudioOutput>(
        `${outputsPath(workspaceId)}/${outputId}/duplicate`,
        { method: "POST" },
    );
}

export function cancelOutput(workspaceId: string, outputId: string) {
    return apiFetch<StudioOutput>(
        `${outputsPath(workspaceId)}/${outputId}/cancel`,
        { method: "POST" },
    );
}

export function deleteOutput(workspaceId: string, outputId: string) {
    return apiFetchVoid(`${outputsPath(workspaceId)}/${outputId}`, {
        method: "DELETE",
    });
}
