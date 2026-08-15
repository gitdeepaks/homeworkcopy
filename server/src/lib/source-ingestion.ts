import { createHash } from "node:crypto";
import {
    NOTEBOOK_PROCESSING_MAX,
    NOTEBOOK_SOURCE_MAX,
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
