import {
    outputAudioAccessSchema,
    type EditOutputContentRequest,
} from "@homeworkcopy/contracts";
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

/**
 * Replaces an editable output's content with the reader's own edit.
 *
 * `PUT` rather than `PATCH`: the payload is the whole deck or table set, so a
 * partial write can never leave content the viewers cannot render.
 */
export function updateOutputContent(
    workspaceId: string,
    outputId: string,
    input: EditOutputContentRequest,
) {
    return apiFetch<StudioOutput>(
        `${outputsPath(workspaceId)}/${outputId}/content`,
        { method: "PUT", body: JSON.stringify(input) },
    );
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
