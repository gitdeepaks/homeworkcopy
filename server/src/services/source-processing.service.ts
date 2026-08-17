/**
 * Source processing pipeline for RAG (Retrieval-Augmented Generation).
 *
 * When a user uploads a PDF or adds text, this service turns raw source data
 * into searchable vector embeddings. The full flow:
 *
 * ```
 * Source (PDF / text)
 *   → extractSourceContent   — pull plain text (from DB or Cloudinary PDF)
 *   → chunkSourceContent     — split into chunks, save to Postgres
 *   → embedAndIndexSource    — embed chunks with OpenAI, upsert to Pinecone
 *   → status: READY
 * ```
 *
 * Inngest runs these steps as separate durable jobs.
 */

import type { PineconeRecord } from "@pinecone-database/pinecone";
import {
    sourceChunkMetadataSchema,
    storedSourceMetadataSchema,
    type StoredSourceMetadata,
    type TranscriptSegment,
} from "@homeworkcopy/contracts";
import { createSignedSourceAudioUrl } from "../lib/audio-storage.js";
import { chunkPages, chunkText } from "../lib/chunking.js";
import { embedTexts } from "../lib/openai.js";
import { getSpeechToTextProvider } from "../lib/stt/index.js";
import { ValidationError } from "../types/app-error.js";
import { extractPdfFromCloudinary } from "../lib/pdf.js";
import { scrapeWebsite } from "../lib/firecrawl.js";
import { fetchYoutubeTranscript } from "../lib/youtube.js";
import { logger } from "../lib/logger.js";
import {
    enforceExtractedContentLimits,
    getSafeProcessingFailure,
    sourceChunkId,
} from "../lib/source-ingestion.js";
import {
    deleteSourceVectors,
    deleteSourceVersionVectors,
    type VectorMetadata,
    upsertSourceVectors,
} from "../lib/pinecone.js";
import {
    deleteChunksBySourceId,
    findChunksBySourceId,
    replaceSourceChunksForProcessingVersion,
    type SourceChunkRecord,
} from "../repositories/source-chunk.repository.js";
import {
    findSourceById,
    updateSourceForProcessingVersion,
    type SourceRecord,
} from "../repositories/source.repository.js";

function parseMetadata(value: SourceRecord["metadata"]): StoredSourceMetadata {
    return storedSourceMetadataSchema.safeParse(value).data ?? {};
}

/**
 * Reads a stored recording back and transcribes it.
 *
 * The file is fetched through a freshly minted signed URL rather than a URL
 * persisted at upload time, so a stored signature can never outlive its
 * validity.
 *
 * @param source - AUDIO source being processed
 * @param metadata - Its parsed metadata, carrying the storage coordinates
 * @returns Transcript text, timestamped segments, and recording facts
 * @throws {Error} When storage, the file, or the provider is unusable
 */
async function transcribeStoredAudio(
    source: SourceRecord,
    metadata: StoredSourceMetadata,
): Promise<{
    text: string;
    segments: TranscriptSegment[];
    durationMs: number | null;
    language: string | null;
    provider: string;
}> {
    const provider = getSpeechToTextProvider();
    if (!provider) {
        throw new Error("No transcription provider is configured");
    }
    if (!metadata.publicId) {
        throw new Error("Audio source is missing its storage metadata");
    }

    const fileName = metadata.fileName ?? `${source.id}.mp3`;
    // The stored format comes from the file's own bytes; a filename extension
    // can disagree with them and would sign a URL for an object that is not there.
    const format = metadata.storageFormat ?? "mp3";
    const url = createSignedSourceAudioUrl(metadata.publicId, format);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Stored recording could not be read (${response.status})`,
        );
    }

    const audio = await response.arrayBuffer();
    if (audio.byteLength > provider.maxInputBytes) {
        throw new ValidationError(
            "The recording is too large for the transcription provider",
        );
    }

    const transcript = await provider.transcribe({
        audio,
        fileName,
        mimeType: metadata.mimeType ?? "audio/mpeg",
    });

    if (!transcript.text) {
        throw new ValidationError(
            "No speech could be transcribed from this recording",
        );
    }

    return { ...transcript, provider: provider.id };
}

/** Facts learned about a recording while transcribing it. */
type ExtractedAudioFacts = {
    durationMs: number | null;
    language: string | null;
    provider: string;
};

type ExtractedSourceText = {
    text: string;
    pageCount: number | undefined;
    pages: string[] | undefined;
    transcriptSegments: TranscriptSegment[] | undefined;
    audio: ExtractedAudioFacts | undefined;
};

/**
 * Reads extractable text from a source record.
 *
 * **Paths:**
 * 1. **Text already in DB** — returns `source.content` (TEXT, URL scrape, YouTube transcript, etc.)
 * 2. **PDF** — downloads from Cloudinary and runs PDF text extraction
 * 3. **AUDIO** — reads the stored recording back and transcribes it
 *
 * @throws If a stored file is unreachable or the source has no extractable content
 */
async function extractSourceText(
    source: SourceRecord,
): Promise<ExtractedSourceText> {
    const text = source.content?.trim();
    if (source.type === "PDF") {
        const metadata = parseMetadata(source.metadata);
        if (metadata.fileUrl) {
            const extracted = await extractPdfFromCloudinary({
                fileUrl: metadata.fileUrl,
                publicId: metadata.publicId,
                // A PDF is never stored as a video asset, unlike an audio source.
                resourceType: metadata.resourceType === "raw" ? "raw" : "image",
            });
            return {
                text: extracted.text,
                pageCount: extracted.pageCount,
                pages: extracted.pages,
                transcriptSegments: undefined,
                audio: undefined,
            };
        }
        if (!text) throw new Error("PDF source is missing fileUrl metadata");
        return {
            text,
            pageCount: metadata.pageCount,
            pages: undefined,
            transcriptSegments: undefined,
            audio: undefined,
        };
    }

    if (source.type === "AUDIO") {
        const metadata = parseMetadata(source.metadata);
        // A previous attempt may already have paid for the transcript.
        if (text && metadata.transcriptSegments?.length) {
            return {
                text,
                pageCount: undefined,
                pages: undefined,
                transcriptSegments: metadata.transcriptSegments,
                audio: undefined,
            };
        }

        const transcribed = await transcribeStoredAudio(source, metadata);
        enforceExtractedContentLimits(
            transcribed.text,
            transcribed.segments.length,
        );
        return {
            text: transcribed.text,
            pageCount: undefined,
            pages: undefined,
            transcriptSegments: transcribed.segments,
            audio: {
                durationMs: transcribed.durationMs,
                language: transcribed.language,
                provider: transcribed.provider,
            },
        };
    }

    if (source.type === "WEBSITE" && source.url) {
        const scraped = await scrapeWebsite(source.url);
        enforceExtractedContentLimits(scraped.markdown);
        return {
            text: scraped.markdown,
            pageCount: undefined,
            pages: undefined,
            transcriptSegments: undefined,
            audio: undefined,
        };
    }

    if (source.type === "YOUTUBE" && source.url) {
        const transcript = await fetchYoutubeTranscript(source.url);
        enforceExtractedContentLimits(transcript.content, transcript.segments.length);
        return {
            text: transcript.content,
            pageCount: undefined,
            pages: undefined,
            transcriptSegments: transcript.segments,
            audio: undefined,
        };
    }

    if (text) {
        const metadata = parseMetadata(source.metadata);
        return {
            text,
            pageCount: undefined,
            pages: undefined,
            transcriptSegments:
                source.type === "YOUTUBE" ? metadata.transcriptSegments : undefined,
            audio: undefined,
        };
    }

    throw new Error(`Source ${source.id} has no extractable content`);
}

/**
 * Sets a source's status to `PROCESSING` while the pipeline runs.
 *
 */
export async function markSourceProcessing(sourceId: string, processingVersion: number) {
    const result = await updateSourceForProcessingVersion(sourceId, processingVersion, {
        status: "PROCESSING",
        processingStage: "EXTRACTING",
    });
    if (result.count === 0) throw new Error("Stale source processing job");
    return result;
}

export async function markSourceStage(
    sourceId: string,
    processingVersion: number,
    processingStage: SourceRecord["processingStage"],
) {
    const result = await updateSourceForProcessingVersion(sourceId, processingVersion, { processingStage });
    if (result.count === 0) throw new Error("Stale source processing job");
    return result;
}

/**
 * Marks a source as `FAILED` and stores the error message in metadata.
 * Called when extract, chunk, or embed steps throw.
 *
 */
export async function markSourceFailed(
    sourceId: string,
    error: Error,
    existingMetadata: SourceRecord["metadata"],
    processingVersion: number,
    failureCode?: StoredSourceMetadata["failureCode"],
) {
    const metadata = parseMetadata(existingMetadata);
    const failure = getSafeProcessingFailure(error);

    return updateSourceForProcessingVersion(sourceId, processingVersion, {
        status: "FAILED",
        processingStage: "FAILED",
        metadata: {
            ...metadata,
            failureCode: failureCode ?? failure.code,
            processingError: failureCode === "QUEUE_UNAVAILABLE"
                ? "Source processing could not be queued. Retry the import."
                : failure.message,
        },
    });
}

/**
 * Step 1 of the pipeline: load text from the source and persist it.
 *
 * - Fetches the source from Postgres
 * - Extracts text (from `content` column or PDF on Cloudinary)
 * - Saves extracted text back to `source.content`
 * - Updates `metadata.pageCount` for PDFs
 *
 * @returns Extracted text plus page array (PDF only) for the chunking step
 *
 */
export async function extractSourceContent(sourceId: string, processingVersion: number) {
    const source = await findSourceById(sourceId);
    if (!source) {
        throw new Error("Source not found");
    }
    if (source.processingVersion !== processingVersion || source.status === "DELETING") {
        throw new Error("Stale source processing job");
    }

    const extracted = await extractSourceText(source);

    enforceExtractedContentLimits(extracted.text, extracted.transcriptSegments?.length);

    const metadata = parseMetadata(source.metadata);
    const nextMetadata: StoredSourceMetadata = {
        ...metadata,
        pageCount: extracted.pageCount ?? metadata.pageCount,
        transcriptSegments: extracted.transcriptSegments ?? metadata.transcriptSegments,
        ...(extracted.audio
            ? {
                  durationMs: extracted.audio.durationMs ?? metadata.durationMs,
                  detectedLanguage:
                      extracted.audio.language ?? metadata.detectedLanguage,
                  transcriptProvider: extracted.audio.provider,
              }
            : {}),
    };
    await updateSourceForProcessingVersion(sourceId, processingVersion, {
        content: extracted.text,
        metadata: nextMetadata,
    });
    logger.info(
        { sourceId, processingVersion, characterCount: extracted.text.length },
        "source extraction completed",
    );

    return {
        sourceId,
        workspaceId: source.workspaceId,
        text: extracted.text,
        pages: extracted.pages,
        transcriptSegments: extracted.transcriptSegments,
        source: { ...source, content: extracted.text, metadata: nextMetadata },
    };
}

/**
 * Step 2 of the pipeline: split text into chunks and save to Postgres.
 *
 * - Deletes any existing chunks for this source (safe re-processing)
 * - Uses `chunkPages` when PDF page array is available (keeps page metadata)
 * - Otherwise uses `chunkText` on the full string
 * - Stores each chunk with an estimated `tokenCount`
 *
 * @param sourceId - Source to attach chunks to
 * @param text - Full extracted text
 * @param pages - Optional per-page strings from PDF extraction
 * @returns Saved chunk records from the database
 *
 *
 */
export async function chunkSourceContent(
    sourceId: string,
    text: string,
    pages?: string[],
    transcriptSegments?: TranscriptSegment[],
    processingVersion = 1,
) {
    const chunks = pages?.length
        ? chunkPages(pages)
        : transcriptSegments?.length
          ? chunkTranscriptSegments(transcriptSegments)
          : chunkText(text);

    if (chunks.length === 0) {
        throw new Error("No chunks were generated from source content");
    }

    const savedChunks = await replaceSourceChunksForProcessingVersion(
        sourceId,
        processingVersion,
        chunks.map((chunk) => ({
            id: sourceChunkId(sourceId, processingVersion, chunk.index, chunk.content),
            sourceId,
            index: chunk.index,
            content: chunk.content,
            tokenCount: Math.ceil(chunk.content.length / 4),
            metadata: chunk.metadata
                ? sourceChunkMetadataSchema.parse(chunk.metadata)
                : undefined,
            processingVersion,
        })),
    );
    logger.info(
        { sourceId, processingVersion, chunkCount: savedChunks.length },
        "source chunking completed",
    );
    return savedChunks;
}

/**
 * Step 3 of the pipeline: embed chunks and store vectors in Pinecone.
 *
 * - Sends chunk text to OpenAI in batches of 50
 * - Builds Pinecone records with embedding + searchable metadata
 * - Upserts vectors into the workspace namespace
 * - Marks source as `READY` with `chunkCount` and `indexedAt`
 *
 * Pinecone metadata includes enough context for retrieval without re-querying Postgres:
 * `sourceTitle`, `sourceType`, chunk `text` (truncated to 35k chars), and optional `page`.
 *
 * @param source - The parent source record
 * @param chunks - Chunk rows already saved in Postgres (must have `id`)
 * @returns Updated source record with status `READY`
 *
 *
 */
export async function embedAndIndexSource(
    source: SourceRecord,
    chunks: SourceChunkRecord[],
    processingVersion: number,
) {
    const batchSize = 50;
    const records: PineconeRecord<VectorMetadata>[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const embeddings = await embedTexts(batch.map((chunk) => chunk.content));
        if (embeddings.length !== batch.length) {
            throw new Error("Embedding provider returned an incomplete batch");
        }

        for (let j = 0; j < batch.length; j += 1) {
            const chunk = batch[j];
            const embedding = embeddings[j];
            if (!chunk || !embedding) {
                throw new Error("Embedding provider returned an incomplete batch");
            }
            const chunkMetadata = sourceChunkMetadataSchema.safeParse(chunk.metadata).data ?? {};

            records.push({
                id: chunk.id,
                values: embedding,
                metadata: {
                    workspaceId: source.workspaceId,
                    sourceId: source.id,
                    chunkId: chunk.id,
                    chunkIndex: chunk.index,
                    sourceTitle: source.title,
                    sourceType: source.type,
                    processingVersion,
                    text: chunk.content.slice(0, 35000),
                    ...(typeof chunkMetadata.page === "number"
                        ? { page: chunkMetadata.page }
                        : {}),
                    ...(typeof chunkMetadata.timestamp === "number"
                        ? { timestamp: chunkMetadata.timestamp }
                        : {}),
                },
            });
        }
    }

    await markSourceStage(source.id, processingVersion, "INDEXING");
    await upsertSourceVectors(source.workspaceId, records);

    const metadata = parseMetadata(source.metadata);

    const result = await updateSourceForProcessingVersion(source.id, processingVersion, {
        status: "READY",
        processingStage: "READY",
        metadata: {
            ...metadata,
            chunkCount: chunks.length,
            indexedAt: new Date().toISOString(),
            processingError: undefined,
        },
    });
    if (result.count === 0) {
        await deleteSourceVersionVectors(
            source.workspaceId,
            source.id,
            processingVersion,
        );
        throw new Error("Stale source processing job");
    }
    logger.info(
        { sourceId: source.id, processingVersion, vectorCount: records.length },
        "source indexing completed",
    );
    return result;
}

function chunkTranscriptSegments(segments: TranscriptSegment[]) {
    const chunks: Array<{
        index: number;
        content: string;
        metadata: { timestamp: number; endTimestamp: number };
    }> = [];
    let content = "";
    let timestamp = 0;
    let endTimestamp = 0;

    for (const segment of segments) {
        if (!content) timestamp = segment.offset;
        const next = content ? `${content} ${segment.text}` : segment.text;
        if (next.length > 1_600 && content) {
            chunks.push({
                index: chunks.length,
                content,
                metadata: { timestamp, endTimestamp },
            });
            content = segment.text;
            timestamp = segment.offset;
        } else {
            content = next;
        }
        endTimestamp = segment.offset + segment.duration;
    }

    if (content) {
        chunks.push({
            index: chunks.length,
            content,
            metadata: { timestamp, endTimestamp },
        });
    }
    return chunks;
}

/**
 * Removes a source from the vector index and deletes its chunks from Postgres.
 * Used when a source is deleted or needs to be fully re-indexed from scratch.
 *
 */
export async function removeSourceFromIndex(
    workspaceId: string,
    sourceId: string,
) {
    await deleteSourceVectors(workspaceId, sourceId);
    await deleteChunksBySourceId(sourceId);
}

/**
 * Returns all chunks for a source plus the total count.
 * Useful for debugging, admin UI, or verifying processing completed.
 *
 */
export async function listChunksForSource(sourceId: string) {
    const chunks = await findChunksBySourceId(sourceId);
    return { chunks, count: chunks.length };
}
