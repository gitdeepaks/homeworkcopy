import { createHash } from "node:crypto";
import {
    NOTEBOOK_PROCESSING_MAX,
    NOTEBOOK_SOURCE_MAX,
    SOURCE_AUDIO_MIME_TYPES,
    SOURCE_AUDIO_UPLOAD_MAX_BYTES,
    SOURCE_EXTRACTED_TEXT_MAX_LENGTH,
    SOURCE_TRANSCRIPT_SEGMENT_MAX,
    SOURCE_UPLOAD_MAX_BYTES,
    type SourceFailureCode,
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

export function getSafeProcessingFailure(error: Error): {
    code: SourceFailureCode;
    message: string;
} {
    if (error instanceof ValidationError) {
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
