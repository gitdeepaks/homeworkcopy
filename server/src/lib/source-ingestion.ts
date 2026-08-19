import { createHash } from "node:crypto";
import { z } from "zod";
import {
    NOTEBOOK_PROCESSING_MAX,
    NOTEBOOK_SOURCE_MAX,
    SOURCE_AUDIO_MIME_TYPES,
    SOURCE_AUDIO_UPLOAD_MAX_BYTES,
    SOURCE_EXTRACTED_TEXT_MAX_LENGTH,
    SOURCE_TRANSCRIPT_SEGMENT_MAX,
    SOURCE_UPLOAD_MAX_BYTES,
    sourceFailureCodeSchema,
    type SourceFailureCode,
    type TranscriptSegment,
} from "@homeworkcopy/contracts";
import { ConflictError, ValidationError } from "../types/app-error.js";

export const SOURCE_LIMITS = {
    notebookSources: NOTEBOOK_SOURCE_MAX,
    concurrentProcessing: NOTEBOOK_PROCESSING_MAX,
    uploadBytes: SOURCE_UPLOAD_MAX_BYTES,
    audioUploadBytes: SOURCE_AUDIO_UPLOAD_MAX_BYTES,
    extractedCharacters: SOURCE_EXTRACTED_TEXT_MAX_LENGTH,
    transcriptSegments: SOURCE_TRANSCRIPT_SEGMENT_MAX,
};

export function checksumContent(content: string | Buffer): string {
    const normalized = typeof content === "string" ? content.trim().replace(/\r\n/g, "\n") : content;
    return createHash("sha256").update(normalized).digest("hex");
}

export function sourceChunkId(
    sourceId: string,
    processingVersion: number,
    index: number,
    content: string,
): string {
    return checksumContent(`${sourceId}:${processingVersion}:${index}:${content}`);
}

export function canonicalizeSourceUrl(value: string): string {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase();
    for (const parameter of [...url.searchParams.keys()]) {
        if (parameter.startsWith("utm_") || parameter === "fbclid") {
            url.searchParams.delete(parameter);
        }
    }
    return url.toString();
}

export function verifyPdfUpload(file: Express.Multer.File): void {
    if (file.size > SOURCE_UPLOAD_MAX_BYTES) {
        throw new ValidationError("PDF files must be 10 MB or smaller");
    }
    if (file.mimetype !== "application/pdf" || file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new ValidationError("The selected file is not a valid PDF");
    }
}

/**
 * Container signatures for the audio formats the upload endpoint accepts.
 *
 * Checked against the file's own bytes so a renamed or mislabelled file cannot
 * reach the transcription provider on the strength of its `Content-Type` alone.
 */
const AUDIO_SIGNATURES: readonly {
    format: string;
    matches: (bytes: Buffer) => boolean;
}[] = [
    {
        format: "mp3",
        matches: (bytes) =>
            bytes.subarray(0, 3).toString("ascii") === "ID3" ||
            // MPEG audio frame sync: 11 set bits.
            (bytes[0] === 0xff && (bytes[1] ?? 0) >= 0xe0),
    },
    {
        format: "wav",
        matches: (bytes) =>
            bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
            bytes.subarray(8, 12).toString("ascii") === "WAVE",
    },
    {
        // ISO base media: MP4/M4A share the `ftyp` box at offset 4.
        format: "m4a",
        matches: (bytes) => bytes.subarray(4, 8).toString("ascii") === "ftyp",
    },
    {
        format: "ogg",
        matches: (bytes) => bytes.subarray(0, 4).toString("ascii") === "OggS",
    },
    {
        format: "flac",
        matches: (bytes) => bytes.subarray(0, 4).toString("ascii") === "fLaC",
    },
    {
        // Matroska/WebM EBML header.
        format: "webm",
        matches: (bytes) =>
            bytes[0] === 0x1a &&
            bytes[1] === 0x45 &&
            bytes[2] === 0xdf &&
            bytes[3] === 0xa3,
    },
];

/**
 * Validates an uploaded audio file and resolves its container format.
 *
 * @param file - Multer file buffer from the upload endpoint
 * @returns The container extension the file should be stored with
 * @throws {ValidationError} When the file is too large or not usable audio
 */
export function verifyAudioUpload(file: Express.Multer.File): {
    format: string;
} {
    if (file.size > SOURCE_AUDIO_UPLOAD_MAX_BYTES) {
        throw new ValidationError("Audio files must be 25 MB or smaller");
    }
    if (!SOURCE_AUDIO_MIME_TYPES.includes(file.mimetype)) {
        throw new ValidationError(
            "Upload an MP3, M4A, WAV, WebM, OGG, or FLAC audio file",
        );
    }

    const signature = AUDIO_SIGNATURES.find((candidate) =>
        candidate.matches(file.buffer),
    );
    if (!signature) {
        throw new ValidationError(
            "The selected file is not a readable audio recording",
        );
    }

    return { format: signature.format };
}

/**
 * One transcribed slice of a longer recording.
 *
 * A recording too large for a transcription provider is split before it is sent,
 * and each slice comes back with timestamps relative to its own start.
 */
export type TranscriptWindow = {
    /** Seconds from the start of the recording at which this window begins. */
    startSeconds: number;
    text: string;
    segments: readonly TranscriptSegment[];
};

/**
 * Rejoins the transcripts of a split recording into one.
 *
 * Every segment is shifted by its window's start, so a citation still points at
 * the moment in the original recording that supports it rather than at an offset
 * into a slice nobody can see. Offsets are rounded to the millisecond, because
 * accumulated float error is noise a reader would eventually notice as drift.
 *
 * @param windows - Transcribed windows in playback order
 * @returns The joined text and the segments on the recording's own timeline
 */
export function mergeTranscriptWindows(windows: readonly TranscriptWindow[]): {
    text: string;
    segments: TranscriptSegment[];
} {
    const segments: TranscriptSegment[] = [];
    const texts: string[] = [];

    for (const window of windows) {
        const text = window.text.trim();
        if (text) texts.push(text);

        for (const segment of window.segments) {
            segments.push({
                text: segment.text,
                offset: roundToMilliseconds(segment.offset + window.startSeconds),
                duration: segment.duration,
            });
        }
    }

    return { text: texts.join(" ").trim(), segments };
}

function roundToMilliseconds(seconds: number): number {
    return Math.round(seconds * 1_000) / 1_000;
}

/**
 * Markers a transcriber emits for sound it heard but could not read as speech.
 *
 * Musical notes, and the bracketed or parenthesised cues both Whisper and
 * YouTube's own captioner use — `[Music]`, `(applause)`, `(speaking in the
 * distance)`.
 */
const NON_LEXICAL_CUE = /[\u266a\u266b\u266c]+|\[[^\]]*\]|\([^)]*\)/gu;

/**
 * Whether a transcript carries speech rather than only sound cues.
 *
 * A transcriber handed music or ambience does not return nothing — it returns
 * pages of cue markers. Indexed, such a source answers no question and only
 * dilutes retrieval, so it is treated as having no content at all.
 *
 * Only a transcript that is *entirely* cues is rejected. A single word of real
 * speech among them is enough to keep the source, because the cues cost little
 * and the speech may be exactly what someone asks about.
 *
 * @param text - Full transcript text
 * @returns Whether anything readable survives once the cues are removed
 */
export function hasTranscribableSpeech(text: string): boolean {
    return /\p{L}|\p{N}/u.test(text.replace(NON_LEXICAL_CUE, " "));
}

export function enforceExtractedContentLimits(
    content: string,
    transcriptSegmentCount = 0,
): void {
    if (content.length > SOURCE_EXTRACTED_TEXT_MAX_LENGTH) {
        throw new ValidationError("Extracted source text exceeds the 2,000,000 character limit");
    }
    if (transcriptSegmentCount > SOURCE_TRANSCRIPT_SEGMENT_MAX) {
        throw new ValidationError("The transcript contains too many caption segments");
    }
}

export function enforceNotebookIngestionLimits(
    sourceCount: number,
    processingCount: number,
): void {
    if (sourceCount >= NOTEBOOK_SOURCE_MAX) {
        throw new ConflictError(`This notebook has reached its ${NOTEBOOK_SOURCE_MAX}-source limit`);
    }
    if (processingCount >= NOTEBOOK_PROCESSING_MAX) {
        throw new ConflictError(
            `Wait for one of the ${NOTEBOOK_PROCESSING_MAX} active imports to finish before adding more`,
        );
    }
}

/**
 * A failure that already classified itself.
 *
 * Matched on `code` rather than with `instanceof`, and rather than on any
 * property we might prefer. Processing errors are thrown inside an Inngest step
 * and caught outside it, and Inngest rebuilds them from a fixed set of fields —
 * `name`, `message`, `stack`, `cause`, and `code`. Arbitrary own properties are
 * dropped in transit, so `code` is the only place a classification can be put
 * and still be there on the other side.
 */
const classifiedFailureSchema = z.object({
    code: sourceFailureCodeSchema,
    message: z.string().min(1),
});

export function getSafeProcessingFailure(error: Error): {
    code: SourceFailureCode;
    message: string;
} {
    const classified = classifiedFailureSchema.safeParse(error);
    if (classified.success) {
        return {
            code: classified.data.code,
            message: classified.data.message,
        };
    }

    if (error instanceof ValidationError || error.name === "ValidationError") {
        const contentLimit = error.message.includes("limit") || error.message.includes("too many");
        return {
            code: contentLimit ? "CONTENT_TOO_LARGE" : "EXTRACTION_FAILED",
            message: error.message,
        };
    }
    if (error.message.includes("chunk")) {
        return { code: "CHUNKING_FAILED", message: "Source chunking failed. Retry the import." };
    }
    if (error.message.includes("embedding")) {
        return { code: "EMBEDDING_FAILED", message: "Source embedding failed. Retry the import." };
    }
    if (error.message.includes("Pinecone") || error.message.includes("index")) {
        return { code: "INDEXING_FAILED", message: "Source indexing failed. Retry the import." };
    }
    return { code: "EXTRACTION_FAILED", message: "Source extraction failed. Retry the import." };
}
