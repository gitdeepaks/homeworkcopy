import {
    createSourceInputSchema,
    importWebsiteInputSchema,
    importYoutubeInputSchema,
    SOURCE_AUDIO_MIME_TYPES,
    SOURCE_AUDIO_UPLOAD_MAX_BYTES,
    SOURCE_BATCH_MAX_ITEMS,
    SOURCE_UPLOAD_MAX_BYTES,
    type CreateSourceInput,
    type ImportWebsiteInput,
    type ImportYoutubeInput,
} from "@homeworkcopy/contracts";

export type PdfFileDescriptor = {
    name: string;
    type: string;
    size: number;
};

export function validatePdfFiles(files: PdfFileDescriptor[]): string | null {
    if (files.length === 0) return "Choose at least one PDF file.";
    if (files.length > SOURCE_BATCH_MAX_ITEMS) {
        return `Add no more than ${SOURCE_BATCH_MAX_ITEMS} files at once.`;
    }
    const invalidType = files.find(
        (file) => file.type !== "application/pdf" || !file.name.toLocaleLowerCase().endsWith(".pdf"),
    );
    if (invalidType) return `${invalidType.name} is not a PDF file.`;
    const oversized = files.find((file) => file.size > SOURCE_UPLOAD_MAX_BYTES);
    if (oversized) return `${oversized.name} is larger than 10 MB.`;
    return null;
}

/**
 * Mirrors the server's audio upload rules so a reader learns about a bad file
 * before it is uploaded. The server still verifies the file's own bytes.
 */
export function validateAudioFiles(files: PdfFileDescriptor[]): string | null {
    if (files.length === 0) return "Choose at least one audio file.";
    if (files.length > SOURCE_BATCH_MAX_ITEMS) {
        return `Add no more than ${SOURCE_BATCH_MAX_ITEMS} files at once.`;
    }
    const invalidType = files.find(
        (file) => !SOURCE_AUDIO_MIME_TYPES.includes(file.type),
    );
    if (invalidType) {
        return `${invalidType.name} is not an MP3, M4A, WAV, WebM, OGG, or FLAC file.`;
    }
    const oversized = files.find(
        (file) => file.size > SOURCE_AUDIO_UPLOAD_MAX_BYTES,
    );
    if (oversized) return `${oversized.name} is larger than 25 MB.`;
    return null;
}

export function validatePastedSource(input: CreateSourceInput): string | null {
    const result = createSourceInputSchema.safeParse(input);
    return result.success ? null : result.error.issues[0]?.message ?? "Check the pasted source.";
}

export function validateWebsiteSource(input: ImportWebsiteInput): string | null {
    const result = importWebsiteInputSchema.safeParse(input);
    return result.success ? null : result.error.issues[0]?.message ?? "Check the website URL.";
}

export function validateYoutubeSource(input: ImportYoutubeInput): string | null {
    const result = importYoutubeInputSchema.safeParse(input);
    return result.success ? null : result.error.issues[0]?.message ?? "Check the YouTube URL.";
}
