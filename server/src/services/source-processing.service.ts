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
import { SourceExtractionError, ValidationError } from "../types/app-error.js";
import { extractPdfFromCloudinary } from "../lib/pdf.js";
import { scrapeWebsite } from "../lib/firecrawl.js";
import {
    captionsUnavailableFailure,
    fetchYoutubeTranscript,
} from "../lib/youtube.js";
import {
    isYoutubeAudioFallbackEnabled,
    readWindowBytes,
    withYoutubeAudio,
} from "../lib/youtube-audio.js";
import { logger } from "../lib/logger.js";
import {
    enforceExtractedContentLimits,
    getSafeProcessingFailure,
    hasTranscribableSpeech,
    mergeTranscriptWindows,
    sourceChunkId,
    type TranscriptWindow,
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

/**
 * Transcribes a caption-less YouTube video from its audio.
 *
 * Reached only once the caption path has confirmed there is nothing to read, so
 * a video that publishes captions never costs a transcription request. The audio
 * arrives as windows because a long recording exceeds what a provider accepts in
 * one request; each window's transcript is shifted back onto the video's own
 * timeline so citations still point at the right moment.
 *
 * @param url - YouTube page URL
 * @param videoId - Video being imported, for the failure message only
 * @returns Transcript text, timestamped segments, and recording facts
 * @throws {SourceExtractionError} When the server cannot transcribe, or the
 * audio cannot be read
 */
async function transcribeYoutubeAudio(
    url: string,
    videoId: string,
): Promise<{
    text: string;
    segments: TranscriptSegment[];
    durationMs: number | null;
    language: string | null;
    provider: string;
}> {
    const provider = getSpeechToTextProvider();

    // Nothing to fall back to: the video has no captions and this deployment
    // either cannot transcribe or has been told not to.
    if (!provider || !isYoutubeAudioFallbackEnabled()) {
        throw captionsUnavailableFailure(videoId);
    }

    return withYoutubeAudio(
        url,
        { maxWindowBytes: provider.maxInputBytes },
        async (windows, facts) => {
            const transcribed: TranscriptWindow[] = [];
            let language: string | null = null;
            let transcribedMs = 0;

            for (const window of windows) {
                const result = await provider.transcribe({
                    audio: await readWindowBytes(window),
                    fileName: window.fileName,
                    mimeType: window.mimeType,
                    // Pinning later windows to the language detected in the
                    // first stops a quiet passage mid-video from being detected
                    // as a different language and transcribed as gibberish.
                    ...(language ? { language } : {}),
                });

                language ??= result.language;
                transcribedMs += result.durationMs ?? 0;
                transcribed.push({
                    startSeconds: window.startSeconds,
                    text: result.text,
                    segments: result.segments,
                });
            }

            const merged = mergeTranscriptWindows(transcribed);

            // Music and ambience come back as pages of `♪♪`, which is not
            // nothing but is nothing anyone can ask a question about.
            if (!hasTranscribableSpeech(merged.text)) {
                throw new SourceExtractionError(
                    "NO_EXTRACTABLE_CONTENT",
                    "This video has no captions and no speech in its audio, so there is nothing to import.",
                );
            }

            return {
                text: merged.text,
                segments: merged.segments,
                // YouTube's own figure covers the whole video; the sum of what
                // was transcribed is the fallback when it reported none.
                durationMs:
                    facts.durationSeconds === null
                        ? transcribedMs || null
                        : Math.round(facts.durationSeconds * 1_000),
                language,
                provider: provider.id,
            };
        },
    );
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
        const metadata = parseMetadata(source.metadata);

        // A previous attempt already paid a provider to transcribe this video's
        // audio. Re-reading YouTube would only rediscover the missing captions.
        if (
            text &&
            metadata.transcriptProvider &&
            metadata.transcriptSegments?.length
        ) {
            return {
                text,
                pageCount: undefined,
                pages: undefined,
                transcriptSegments: metadata.transcriptSegments,
                audio: undefined,
            };
        }

        const outcome = await fetchYoutubeTranscript(source.url);
        if (outcome.kind === "transcript") {
            enforceExtractedContentLimits(
                outcome.content,
                outcome.segments.length,
            );
            return {
                text: outcome.content,
                pageCount: undefined,
                pages: undefined,
                transcriptSegments: outcome.segments,
                audio: undefined,
            };
        }

        // No captions exist, so the spoken audio is the only source of text.
        logger.info(
            { sourceId: source.id, videoId: outcome.videoId },
            "youtube video has no captions, transcribing its audio",
        );
        const transcribed = await transcribeYoutubeAudio(
            source.url,
            outcome.videoId,
        );
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
