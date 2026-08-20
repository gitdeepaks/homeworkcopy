import { z } from "zod";
import { storedSourceMetadataSchema } from "@homeworkcopy/contracts";
import {
    deleteAudioObject,
    isAudioStorageConfigured,
    storeSourceAudioObject,
} from "../lib/audio-storage.js";
import { getSpeechToTextProvider } from "../lib/stt/index.js";
import { parseYoutubeVideoId } from "../lib/youtube.js";
import { deleteCloudinaryObject, uploadPdfToCloudinary } from "../lib/cloudinary.js";
import { enqueueSourceDeletion, enqueueSourceProcessing } from "../lib/source-events.js";
import { logger } from "../lib/logger.js";
import { assertPublicUrl } from "../lib/url-guard.js";
import {
    createSourceRecord,
    beginSourceReprocessing,
    deleteSourceRecord,
    findSourceByIdAndWorkspaceId,
    findSourceById,
    findSourcesByIdsAndWorkspaceId,
    findSourcesByWorkspaceId,
    findSourceByChecksum,
    findSourceByIdempotencyKey,
    updateSourceRecord,
    type SourceRecord,
} from "../repositories/source.repository.js";
import { recordAuditEvent } from "./audit.service.js";
import {
    authorizeNotebook,
    type Actor,
} from "./notebook-access.service.js";
import {
    ConflictError,
    NotFoundError,
    ValidationError,
} from "../types/app-error.js";
import type { SourceSelection } from "@homeworkcopy/contracts";
import type {
    CreateSourceInput,
    ImportWebsiteInput,
    ImportWebSearchInput,
    ImportYoutubeInput,
    ListSourcesQuery,
    ReprocessSourcesInput,
} from "../validators/source.validator.js";
import {
    listChunksForSource,
    markSourceFailed,
    removeSourceFromIndex,
} from "./source-processing.service.js";
import { validateGroundingSourceCandidates } from "./grounding-source-selection.js";
import {
    canonicalizeSourceUrl,
    checksumContent,
    verifyAudioUpload,
    verifyPdfUpload,
} from "../lib/source-ingestion.js";

const PROCESSING_QUEUE_UNAVAILABLE =
    "Source processing could not be queued. Check the background worker and retry.";

/**
 * Persists a source row and enqueues the Inngest processing pipeline.
 *
 * @param data - Fields for the new source record
 * @returns Created source with status `PENDING`, or `FAILED` when the queue is unavailable
 *
 */
async function createAndProcessSource(
    data: Parameters<typeof createSourceRecord>[0],
) {
    if (data.idempotencyKey) {
        const existing = await findSourceByIdempotencyKey(data.workspaceId, data.idempotencyKey);
        if (existing) return existing;
    }
    if (data.contentChecksum) {
        const duplicate = await findSourceByChecksum(data.workspaceId, data.contentChecksum);
        if (duplicate) {
            throw new ConflictError(`This source already exists as “${duplicate.title}”`);
        }
    }

    let source: SourceRecord;
    try {
        source = await createSourceRecord(data);
    } catch (error) {
        if (data.idempotencyKey) {
            const existing = await findSourceByIdempotencyKey(data.workspaceId, data.idempotencyKey);
            if (existing) return existing;
        }
        if (data.contentChecksum) {
            const duplicate = await findSourceByChecksum(data.workspaceId, data.contentChecksum);
            if (duplicate) {
                throw new ConflictError(`This source already exists as “${duplicate.title}”`);
            }
        }
        throw error;
    }

    try {
        await enqueueSourceProcessing({
            sourceId: source.id,
            workspaceId: source.workspaceId,
            processingVersion: source.processingVersion,
        });
    } catch (error) {
        logger.error(
            {
                error,
                sourceId: source.id,
                workspaceId: source.workspaceId,
            },
            "source processing enqueue failed",
        );

        await markSourceFailed(
            source.id,
            new Error(PROCESSING_QUEUE_UNAVAILABLE),
            source.metadata,
            source.processingVersion,
            "QUEUE_UNAVAILABLE",
        );
        const failedSource = await findSourceById(source.id);
        if (!failedSource) throw new Error("Queued source no longer exists");
        return failedSource;
    }

    return source;
}

/**
 * Lists sources in a workspace with optional search and filter query params.
 *
 * @param workspaceId - Workspace to list sources from
 * @param userId - Authenticated user's id
 * @param filters - Optional `q`, `type`, and `status` filters
 * @returns Matching source records
 *
 */
export async function listSourcesForWorkspace(
    workspaceId: string,
    userId: string,
    filters: ListSourcesQuery = {},
) {
    await authorizeNotebook(workspaceId, userId, "notebook:read");
    return findSourcesByWorkspaceId(workspaceId, filters);
}

export async function resolveReadySourcesForWorkspace(
    workspaceId: string,
    userId: string,
    selection: SourceSelection,
): Promise<SourceRecord[]> {
    await authorizeNotebook(workspaceId, userId, "notebook:read");
    return resolveReadySourceRecords(workspaceId, selection);
}

export async function resolveReadySourceRecords(
    workspaceId: string,
    selection: SourceSelection,
): Promise<SourceRecord[]> {
    if (selection.selectionMode === "all-ready") {
        const readySources = await findSourcesByWorkspaceId(workspaceId, {
            status: "READY",
        });
        return validateGroundingSourceCandidates(selection, readySources);
    }

    const sources = await findSourcesByIdsAndWorkspaceId(
        selection.sourceIds,
        workspaceId,
    );
    return validateGroundingSourceCandidates(selection, sources);
}

/**
 * Loads a single source after verifying workspace ownership.
 *
 * @param workspaceId - Workspace the source belongs to
 * @param sourceId - Source to fetch
 * @param userId - Authenticated user's id
 * @returns Source record
 * @throws {NotFoundError} When the source does not exist in this workspace
 *
 */
export async function getSourceForWorkspace(
    workspaceId: string,
    sourceId: string,
    userId: string,
): Promise<SourceRecord> {
    await authorizeNotebook(workspaceId, userId, "notebook:read");

    const source = await findSourceByIdAndWorkspaceId(sourceId, workspaceId);

    if (!source) {
        throw new NotFoundError("Source not found");
    }

    return source;
}

/**
 * Creates a plain-text or markdown source and queues it for RAG indexing.
 *
 * @param workspaceId - Workspace to attach the source to
 * @param userId - Authenticated user's id
 * @param input - Source type, title, and raw content
 * @returns New source with status `PENDING`
 *
 */
export async function createTextOrMarkdownSource(
    workspaceId: string,
    userId: string,
    input: CreateSourceInput,
    idempotencyKey?: string,
) {
    await authorizeNotebook(workspaceId, userId, "source:create");

    return createAndProcessSource({
        workspaceId,
        type: input.type,
        title: input.title,
        content: input.content,
        status: "PENDING",
        contentChecksum: checksumContent(input.content),
        idempotencyKey,
    });
}

/**
 * Validates and uploads a PDF to durable storage, then queues extraction.
 *
 * @param workspaceId - Workspace to attach the source to
 * @param userId - Authenticated user's id
 * @param file - Multer file buffer from the upload endpoint
 * @param title - Optional custom title (defaults to filename without `.pdf`)
 * @returns New PDF source with Cloudinary metadata and status `PENDING`
 *
 */
export async function uploadPdfSource(
    workspaceId: string,
    userId: string,
    file: Express.Multer.File,
    title?: string,
    idempotencyKey?: string,
) {
    await authorizeNotebook(workspaceId, userId, "source:create");
    verifyPdfUpload(file);

    const contentChecksum = checksumContent(file.buffer);
    if (idempotencyKey) {
        const existing = await findSourceByIdempotencyKey(workspaceId, idempotencyKey);
        if (existing) return existing;
    }
    const duplicate = await findSourceByChecksum(workspaceId, contentChecksum);
    if (duplicate) throw new ConflictError(`This PDF already exists as “${duplicate.title}”`);

    const upload = await uploadPdfToCloudinary(
        file.buffer,
        file.originalname,
    );

    try {
        const created = await createAndProcessSource({
            workspaceId,
            type: "PDF",
            title:
                title?.trim() ||
                file.originalname.replace(/\.pdf$/i, "").trim().slice(0, 200) ||
                "Untitled PDF",
            status: "PENDING",
            processingStage: "QUEUED",
            contentChecksum,
            idempotencyKey,
            metadata: {
                fileUrl: upload.secureUrl,
                fileName: upload.originalFilename,
                fileSize: upload.bytes,
                publicId: upload.publicId,
                resourceType: upload.resourceType,
                safetyCheck: "pdf-signature-verified",
            },
        });
        const createdMetadata = z.record(z.string(), z.json()).safeParse(created.metadata).data ?? {};
        if (createdMetadata.publicId !== upload.publicId) {
            await deleteCloudinaryObject(upload.publicId, upload.resourceType);
        }
        return created;
    } catch (error) {
        await deleteCloudinaryObject(upload.publicId, upload.resourceType).catch((cleanupError) => {
            logger.error({ cleanupError, publicId: upload.publicId }, "orphaned PDF cleanup failed");
        });
        throw error;
    }
}

/**
 * Whether this deployment can accept an audio file as a source.
 *
 * Needs both durable storage for the file and a transcription provider, so a
 * reader is never offered an upload that could only fail in the background.
 */
export function isAudioSourceIngestionAvailable(): boolean {
    return getSpeechToTextProvider() !== null && isAudioStorageConfigured();
}

/**
 * Validates and uploads an audio file, then queues transcription.
 *
 * The file is stored as an authenticated object and transcribed in the
 * background, which yields timestamped segments — so a citation from an audio
 * source can point at the moment in the recording that supports it.
 *
 * @param workspaceId - Notebook to attach the source to
 * @param userId - Authenticated user's id
 * @param file - Multer file buffer from the upload endpoint
 * @param title - Optional custom title (defaults to the filename)
 * @param idempotencyKey - Optional client key making a retried upload a no-op
 * @returns New AUDIO source with storage metadata and status `PENDING`
 * @throws {ValidationError} When the deployment or the file cannot support it
 * @throws {ConflictError} When the same recording is already in this notebook
 */
export async function uploadAudioSource(
    workspaceId: string,
    userId: string,
    file: Express.Multer.File,
    title?: string,
    idempotencyKey?: string,
) {
    await authorizeNotebook(workspaceId, userId, "source:create");

    if (!isAudioSourceIngestionAvailable()) {
        throw new ValidationError(
            "Audio sources are not available on this deployment yet.",
        );
    }

    const { format } = verifyAudioUpload(file);
    const contentChecksum = checksumContent(file.buffer);

    if (idempotencyKey) {
        const existing = await findSourceByIdempotencyKey(
            workspaceId,
            idempotencyKey,
        );
        if (existing) return existing;
    }
    const duplicate = await findSourceByChecksum(workspaceId, contentChecksum);
    if (duplicate) {
        throw new ConflictError(
            `This recording already exists as “${duplicate.title}”`,
        );
    }

    // Keyed by notebook and checksum: a retry after a failed row insert
    // overwrites the same object rather than leaving an orphan, while two
    // notebooks holding the same recording keep separate objects — so deleting
    // one notebook's source can never break the other's.
    const stored = await storeSourceAudioObject(
        file.buffer,
        `${workspaceId}/${contentChecksum}`,
        format,
    );

    try {
        const created = await createAndProcessSource({
            workspaceId,
            type: "AUDIO",
            title:
                title?.trim() ||
                file.originalname.replace(/\.[^.]+$/, "").trim().slice(0, 200) ||
                "Untitled recording",
            status: "PENDING",
            processingStage: "QUEUED",
            contentChecksum,
            idempotencyKey,
            metadata: {
                fileName: file.originalname,
                fileSize: stored.bytes,
                publicId: stored.publicId,
                resourceType: "video",
                storageFormat: format,
                mimeType: file.mimetype,
                ...(stored.durationMs === null
                    ? {}
                    : { durationMs: stored.durationMs }),
                safetyCheck: "audio-container-verified",
            },
        });

        const createdMetadata =
            storedSourceMetadataSchema.safeParse(created.metadata).data ?? {};
        if (createdMetadata.publicId !== stored.publicId) {
            // An idempotent replay resolved to an earlier source, so this
            // upload's object is unreferenced.
            await deleteAudioObject(stored.publicId);
        }

        return created;
    } catch (error) {
        await deleteAudioObject(stored.publicId).catch((cleanupError: unknown) => {
            logger.error(
                { cleanupError, publicId: stored.publicId },
                "orphaned audio cleanup failed",
            );
        });
        throw error;
    }
}

/**
 * Scrapes a website via Firecrawl and creates a source from the markdown content.
 *
 * @param workspaceId - Workspace to attach the source to
 * @param userId - Authenticated user's id
 * @param input - URL and optional custom title
 * @returns New WEBSITE source with scraped markdown and status `PENDING`
 *
 */
export async function importWebsiteSource(
    workspaceId: string,
    userId: string,
    input: ImportWebsiteInput,
    idempotencyKey?: string,
) {
    await authorizeNotebook(workspaceId, userId, "source:create");
    const url = canonicalizeSourceUrl(input.url);

    // Checked at import rather than at scrape time, so a reader who pastes an
    // internal address is told immediately instead of watching a source sit in
    // PENDING and then fail with a provider error. The address is re-checked
    // before anything is actually fetched.
    await assertPublicUrl(url);

    return createAndProcessSource({
        workspaceId,
        type: "WEBSITE",
        title: input.title || new URL(url).hostname,
        url,
        status: "PENDING",
        contentChecksum: checksumContent(url),
        idempotencyKey,
        metadata: {
            importedFrom: url,
            sourceUrl: url,
        },
    });
}

/**
 * Fetches a YouTube transcript and creates a source from the caption text.
 *
 * @param workspaceId - Workspace to attach the source to
 * @param userId - Authenticated user's id
 * @param input - YouTube URL and optional custom title
 * @returns New YOUTUBE source with transcript content and status `PENDING`
 *
 */
export async function importYoutubeSource(
    workspaceId: string,
    userId: string,
    input: ImportYoutubeInput,
    idempotencyKey?: string,
) {
    await authorizeNotebook(workspaceId, userId, "source:create");
    const url = canonicalizeSourceUrl(input.url);
    const videoId = parseYoutubeVideoId(url);
    if (!videoId) throw new ConflictError("YouTube video identifier could not be resolved");

    return createAndProcessSource({
        workspaceId,
        type: "YOUTUBE",
        title: input.title || `YouTube: ${videoId}`,
        url,
        status: "PENDING",
        contentChecksum: checksumContent(`youtube:${videoId}`),
        idempotencyKey,
        metadata: {
            videoId,
        },
    });
}

/**
 * Deletes a source, its Pinecone vectors, and its Postgres chunks.
 *
 * @param workspaceId - Workspace the source belongs to
 * @param sourceId - Source to delete
 * @param userId - Authenticated user's id
 * @returns Resolves when the source row is deleted
 * @throws {NotFoundError} When the source is not found
 *
 */
export async function deleteSourceForWorkspace(
    workspaceId: string,
    actor: Actor,
    sourceId: string,
) {
    await authorizeNotebook(workspaceId, actor.id, "source:delete");
    const source = await getSourceForWorkspace(
        workspaceId,
        sourceId,
        actor.id,
    );

    await recordAuditEvent({
        workspaceId,
        type: "SOURCE_DELETED",
        actor,
        context: { targetResourceId: sourceId, targetTitle: source.title },
    });

    if (source.status !== "DELETING") {
        await updateSourceRecord(sourceId, {
            status: "DELETING",
            processingStage: "CLEANING_UP",
        });
    }
    try {
        await enqueueSourceDeletion({ workspaceId, sourceId });
    } catch (error) {
        const parsedMetadata = z.record(z.string(), z.json()).safeParse(source.metadata);
        await updateSourceRecord(sourceId, {
            metadata: {
                ...(parsedMetadata.data ?? {}),
                failureCode: "CLEANUP_FAILED",
                cleanupError: "Cleanup could not be queued. Retry removal.",
            },
        });
        logger.error({ error, workspaceId, sourceId }, "source cleanup enqueue failed");
        throw error;
    }
}

export async function cleanupSourceById(sourceId: string, workspaceId: string) {
    const source = await findSourceByIdAndWorkspaceId(sourceId, workspaceId);
    if (!source) return;

    const metadata = z.record(z.string(), z.json()).safeParse(source.metadata).data ?? {};
    const publicId = typeof metadata.publicId === "string" ? metadata.publicId : undefined;
    const resourceType =
        metadata.resourceType === "image"
            ? "image"
            : metadata.resourceType === "video"
              ? "video"
              : "raw";
    try {
        await removeSourceFromIndex(workspaceId, sourceId);
        if (publicId) {
            // Audio sources are stored as authenticated assets, so they must be
            // destroyed with that delivery type; PDFs use the default upload type.
            await deleteCloudinaryObject(
                publicId,
                resourceType,
                resourceType === "video" ? "authenticated" : "upload",
            );
        }
        await deleteSourceRecord(sourceId);
        logger.info(
            { sourceId, workspaceId, binaryDeleted: Boolean(publicId) },
            "source cleanup completed",
        );
    } catch (error) {
        await updateSourceRecord(sourceId, {
            metadata: {
                ...metadata,
                failureCode: "CLEANUP_FAILED",
                cleanupError: "Source cleanup is incomplete. Retry removal.",
            },
        });
        logger.error({ error, sourceId, workspaceId }, "source cleanup failed");
        throw error;
    }
}

/**
 * Returns indexed chunks for a source (debugging / admin UI).
 *
 * @param workspaceId - Workspace the source belongs to
 * @param sourceId - Source whose chunks to list
 * @param userId - Authenticated user's id
 * @returns Chunk rows and total count
 *
 */
export async function getSourceChunksForWorkspace(
    workspaceId: string,
    sourceId: string,
    userId: string,
) {
    const source = await getSourceForWorkspace(workspaceId, sourceId, userId);
    const result = await listChunksForSource(sourceId);
    return { source, ...result };
}

/**
 * Deletes multiple sources in sequence.
 *
 * @param workspaceId - Workspace containing the sources
 * @param userId - Authenticated user's id
 * @param sourceIds - Array of source ids to delete
 * @returns Resolves when all sources are deleted
 *
 */
export async function bulkDeleteSourcesForWorkspace(
    workspaceId: string,
    actor: Actor,
    sourceIds: string[],
) {
    await authorizeNotebook(workspaceId, actor.id, "source:delete");

    for (const sourceId of sourceIds) {
        await deleteSourceForWorkspace(workspaceId, actor, sourceId);
    }
}

/**
 * Re-queues failed sources for re-processing.
 *
 * When `sourceIds` is omitted, all `FAILED` sources in the workspace are reprocessed.
 * When provided, only failed sources whose id is in the list are reprocessed.
 *
 * @param workspaceId - Workspace containing the sources
 * @param userId - Authenticated user's id
 * @param input - Optional subset of source ids to reprocess
 * @returns Count of sources that were requeued
 *
 *
 */
export async function reprocessSourcesForWorkspace(
    workspaceId: string,
    userId: string,
    input: ReprocessSourcesInput = {},
) {
    await authorizeNotebook(workspaceId, userId, "source:reprocess");

    const sources = await findSourcesByWorkspaceId(workspaceId, {
        status: "FAILED",
    });

    const targets = input.sourceIds?.length
        ? sources.filter((source) => input.sourceIds?.includes(source.id))
        : sources;

    for (const source of targets) {
        await reprocessSourceForWorkspace(workspaceId, source.id, userId);
    }

    return { reprocessed: targets.length };
}

/**
 * Clears vectors/chunks and re-queues a single source for full re-indexing.
 *
 * @param workspaceId - Workspace the source belongs to
 * @param sourceId - Source to reprocess
 * @param userId - Authenticated user's id
 * @returns Resolves when the source is reset to `PENDING` and re-enqueued
 * @throws {NotFoundError} When the source is not found
 *
 */
export async function reprocessSourceForWorkspace(
    workspaceId: string,
    sourceId: string,
    userId: string,
) {
    await authorizeNotebook(workspaceId, userId, "source:reprocess");
    const source = await getSourceForWorkspace(workspaceId, sourceId, userId);

    await removeSourceFromIndex(workspaceId, sourceId);

    const parsedMetadata = z.record(z.string(), z.json()).safeParse(source.metadata);
    const metadata = { ...(parsedMetadata.data ?? {}) };

    delete metadata.processingError;
    delete metadata.failureCode;
    delete metadata.cleanupError;
    delete metadata.indexedAt;
    delete metadata.chunkCount;

    const queuedSource = await beginSourceReprocessing(sourceId);
    await updateSourceRecord(sourceId, { metadata });

    try {
        await enqueueSourceProcessing({
            sourceId,
            workspaceId,
            processingVersion: queuedSource.processingVersion,
        });
    } catch (error) {
        logger.error(
            { error, sourceId, workspaceId },
            "source reprocessing enqueue failed",
        );
        await markSourceFailed(
            sourceId,
            new Error(PROCESSING_QUEUE_UNAVAILABLE),
            metadata,
            queuedSource.processingVersion,
            "QUEUE_UNAVAILABLE",
        );
    }
}

/**
 * Saves web search results (from Tavily) as a WEBSITE source for RAG indexing.
 *
 * Used when the user chooses to add a web search result to their workspace sources.
 *
 * @param workspaceId - Workspace to attach the source to
 * @param userId - Authenticated user's id
 * @param input - Title, scraped content, and source URL from search
 * @returns New WEBSITE source with status `PENDING`
 *
 */
export async function importWebSearchSource(
    workspaceId: string,
    userId: string,
    input: ImportWebSearchInput,
    idempotencyKey?: string,
) {
    await authorizeNotebook(workspaceId, userId, "source:create");

    return createAndProcessSource({
        workspaceId,
        type: "WEBSITE",
        title: input.title,
        content: input.content,
        url: input.url,
        status: "PENDING",
        contentChecksum: checksumContent(input.content),
        idempotencyKey,
        metadata: {
            importedFrom: "web-search",
            sourceUrl: input.url,
        },
    });
}
