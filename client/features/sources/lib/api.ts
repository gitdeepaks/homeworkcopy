import { ApiError, apiFetch, apiFetchVoid, apiFetchWithSchema, authenticatedFetch } from "@/shared/lib/api";
import {
    apiErrorResponseSchema,
    sourceChunksResponseSchema,
    sourceSchema,
} from "@homeworkcopy/contracts";
import { z } from "zod";
import type {
    CreateSourceInput,
    ImportWebsiteInput,
    ImportYoutubeInput,
    SourceFilters,
} from "./types";

function buildSourcesPath(workspaceId: string, filters?: SourceFilters) {
    const params = new URLSearchParams();

    if (filters?.q) {
        params.set("q", filters.q);
    }

    if (filters?.type) {
        params.set("type", filters.type);
    }

    if (filters?.status) {
        params.set("status", filters.status);
    }

    const query = params.toString();
    return `/api/workspaces/${workspaceId}/sources${query ? `?${query}` : ""}`;
}

export function listSources(workspaceId: string, filters?: SourceFilters) {
    return apiFetchWithSchema(
        buildSourcesPath(workspaceId, filters),
        z.array(sourceSchema),
    );
}

export function getSource(workspaceId: string, sourceId: string) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/sources/${sourceId}`,
        sourceSchema,
    );
}

export function getSourceChunks(workspaceId: string, sourceId: string) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/sources/${sourceId}/chunks`,
        sourceChunksResponseSchema,
    );
}

/**
 * The idempotency header, as a fragment to spread into a request.
 *
 * `fetch` distinguishes a header that is absent from one whose value is
 * `undefined`, so a caller without a key has to contribute no key at all rather
 * than contribute an undefined one.
 */
function idempotentRequest(key: string | undefined): Pick<RequestInit, "headers"> {
    return key === undefined ? {} : { headers: { "Idempotency-Key": key } };
}

export function createSource(
    workspaceId: string,
    input: CreateSourceInput,
    idempotencyKey?: string,
) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/sources`,
        sourceSchema,
        {
            method: "POST",
            body: JSON.stringify(input),
            ...idempotentRequest(idempotencyKey),
        },
    );
}

export function importWebsiteSource(
    workspaceId: string,
    input: ImportWebsiteInput,
    idempotencyKey?: string,
) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/sources/import/website`,
        sourceSchema,
        {
            method: "POST",
            body: JSON.stringify(input),
            ...idempotentRequest(idempotencyKey),
        },
    );
}

export function importYoutubeSource(
    workspaceId: string,
    input: ImportYoutubeInput,
    idempotencyKey?: string,
) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/sources/import/youtube`,
        sourceSchema,
        {
            method: "POST",
            body: JSON.stringify(input),
            ...idempotentRequest(idempotencyKey),
        },
    );
}

async function uploadSourceFile(
    path: string,
    file: File,
    title?: string,
    idempotencyKey?: string,
) {
    const formData = new FormData();
    formData.append("file", file);

    if (title?.trim()) {
        formData.append("title", title.trim());
    }

    const response = await authenticatedFetch(path, {
        method: "POST",
        credentials: "include",
        body: formData,
        ...idempotentRequest(idempotencyKey),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        const parsed = apiErrorResponseSchema.safeParse(data);
        throw new ApiError(
            response.status,
            parsed.success ? parsed.data.error.code : "UPLOAD_FAILED",
            parsed.success ? parsed.data.error.message : "Upload failed",
            parsed.success ? parsed.data.error.details : undefined,
        );
    }

    return sourceSchema.parse(data);
}

export function uploadPdfSource(
    workspaceId: string,
    file: File,
    title?: string,
    idempotencyKey?: string,
) {
    return uploadSourceFile(
        `/api/workspaces/${workspaceId}/sources/upload`,
        file,
        title,
        idempotencyKey,
    );
}

/**
 * Uploads a recording. Transcription runs in the background, so the returned
 * source is `PENDING` until its timestamped transcript is indexed.
 */
export function uploadAudioSource(
    workspaceId: string,
    file: File,
    title?: string,
    idempotencyKey?: string,
) {
    return uploadSourceFile(
        `/api/workspaces/${workspaceId}/sources/upload/audio`,
        file,
        title,
        idempotencyKey,
    );
}

export function deleteSource(workspaceId: string, sourceId: string) {
    return apiFetchVoid(
        `/api/workspaces/${workspaceId}/sources/${sourceId}`,
        { method: "DELETE" },
    );
}

export function bulkDeleteSources(workspaceId: string, sourceIds: string[]) {
    return apiFetchVoid(
        `/api/workspaces/${workspaceId}/sources/bulk-delete`,
        {
            method: "POST",
            body: JSON.stringify({ sourceIds }),
        },
    );
}

export function reprocessSources(
    workspaceId: string,
    sourceIds?: string[],
) {
    return apiFetch<{ reprocessed: number }>(
        `/api/workspaces/${workspaceId}/sources/reprocess`,
        {
            method: "POST",
            body: JSON.stringify(
                sourceIds?.length ? { sourceIds } : {},
            ),
        },
    );
}

export function reprocessSource(workspaceId: string, sourceId: string) {
    return apiFetch<{ reprocessed: boolean }>(
        `/api/workspaces/${workspaceId}/sources/${sourceId}/reprocess`,
        { method: "POST" },
    );
}

export function importWebSearchSource(
    workspaceId: string,
    input: { title: string; content: string; url: string },
) {
    return apiFetchWithSchema(
        `/api/workspaces/${workspaceId}/sources/import/web-search`,
        sourceSchema,
        {
            method: "POST",
            body: JSON.stringify(input),
        },
    );
}
