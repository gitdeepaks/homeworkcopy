import { outputAudioAccessSchema } from "@homeworkcopy/contracts";
import { apiFetch, apiFetchVoid, apiFetchWithSchema } from "@/shared/lib/api";
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

/**
 * Fetches short-lived signed URLs for an Audio Overview's media.
 *
 * The response is validated because the URLs are handed straight to an
 * `<audio>` element and a download control.
 */
export function getOutputAudio(workspaceId: string, outputId: string) {
    return apiFetchWithSchema(
        `${outputsPath(workspaceId)}/${outputId}/audio`,
        outputAudioAccessSchema,
    );
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
