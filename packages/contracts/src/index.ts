import { z } from "zod";

export const sourceTypeSchema = z.enum([
    "PDF",
    "WEBSITE",
    "YOUTUBE",
    "TEXT",
    "MARKDOWN",
    "AUDIO",
]);

export type SourceType = z.infer<typeof sourceTypeSchema>;

export const sourceStatusSchema = z.enum([
    "PENDING",
    "PROCESSING",
    "READY",
    "FAILED",
    "DELETING",
]);

export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const SOURCE_SELECTION_MAX = 50;
export const SOURCE_TITLE_MAX_LENGTH = 200;
export const SOURCE_URL_MAX_LENGTH = 2_048;
export const SOURCE_CONTENT_MAX_LENGTH = 750_000;
export const SOURCE_EXTRACTED_TEXT_MAX_LENGTH = 2_000_000;
export const SOURCE_TRANSCRIPT_SEGMENT_MAX = 25_000;
export const SOURCE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/**
 * Upload ceiling for audio sources.
 *
 * Kept at the smallest per-file limit across hosted transcription vendors, so a
 * file that is accepted here can always be transcribed.
 */
export const SOURCE_AUDIO_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const SOURCE_BATCH_MAX_ITEMS = 10;
export const NOTEBOOK_SOURCE_MAX = 100;
export const NOTEBOOK_PROCESSING_MAX = 5;
export const SOURCE_PROCESSING_VERSION = 1;
export const RETRIEVAL_VERSION = "hybrid-v1";
export const CHAT_MESSAGE_MAX_LENGTH = 20_000;
export const CHAT_HISTORY_MAX_MESSAGES = 100;
export const CHAT_WEB_QUERY_MAX_LENGTH = 500;

export const sourceProcessingStageSchema = z.enum([
    "QUEUED",
    "UPLOADING",
    "EXTRACTING",
    "CHUNKING",
    "EMBEDDING",
    "INDEXING",
    "READY",
    "FAILED",
    "CLEANING_UP",
]);

export const sourceFailureCodeSchema = z.enum([
    "QUEUE_UNAVAILABLE",
    "EXTRACTION_FAILED",
    "CONTENT_TOO_LARGE",
    "NO_EXTRACTABLE_CONTENT",
    "CHUNKING_FAILED",
    "EMBEDDING_FAILED",
    "INDEXING_FAILED",
    "CLEANUP_FAILED",
]);

export type SourceProcessingStage = z.infer<typeof sourceProcessingStageSchema>;
export type SourceFailureCode = z.infer<typeof sourceFailureCodeSchema>;

const sourceTitleSchema = z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(SOURCE_TITLE_MAX_LENGTH);
const sourceContentInputSchema = z
    .string()
    .trim()
    .min(1, "Content is required")
    .max(SOURCE_CONTENT_MAX_LENGTH, "Content is too large");
const httpUrlSchema = z
    .url({ protocol: /^https?$/ })
    .max(SOURCE_URL_MAX_LENGTH);

export const createSourceInputSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("TEXT"),
        title: sourceTitleSchema,
        content: sourceContentInputSchema,
    }),
    z.object({
        type: z.literal("MARKDOWN"),
        title: sourceTitleSchema,
        content: sourceContentInputSchema,
    }),
]);

export const importWebsiteInputSchema = z.object({
    url: httpUrlSchema,
    title: sourceTitleSchema.optional(),
});

export const importYoutubeInputSchema = z.object({
    url: httpUrlSchema.refine(
        (url) => /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)[\w-]{11}/.test(url),
        "Enter a valid YouTube URL",
    ),
    title: sourceTitleSchema.optional(),
});

export const sourceIdempotencyKeySchema = z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency key contains unsupported characters");

export type CreateSourceInput = z.infer<typeof createSourceInputSchema>;
export type ImportWebsiteInput = z.infer<typeof importWebsiteInputSchema>;
export type ImportYoutubeInput = z.infer<typeof importYoutubeInputSchema>;

export const sourceSelectionModeSchema = z.enum(["all-ready", "custom"]);
export const groundingModeSchema = z.enum([
    "notebook",
    "notebook-web",
    "notebook-general",
]);

const sourceIdSchema = z.string().trim().min(1);
const uniqueSourceIdsSchema = z
    .array(sourceIdSchema)
    .max(SOURCE_SELECTION_MAX)
    .refine((sourceIds) => new Set(sourceIds).size === sourceIds.length, {
        message: "Source ids must be unique",
    });

export const sourceSelectionSchema = z.discriminatedUnion("selectionMode", [
    z.object({
        selectionMode: z.literal("all-ready"),
        sourceIds: uniqueSourceIdsSchema,
    }),
    z.object({
        selectionMode: z.literal("custom"),
        sourceIds: uniqueSourceIdsSchema.min(1),
    }),
]);

export const groundingRequestSchema = z.intersection(
    sourceSelectionSchema,
    z.object({ groundingMode: groundingModeSchema }),
);

export const groundingSnapshotSchema = z.object({
    version: z.literal(1),
    selectionMode: sourceSelectionModeSchema,
    groundingMode: groundingModeSchema,
    sourceIds: uniqueSourceIdsSchema.min(1),
    retrievalVersion: z.literal(RETRIEVAL_VERSION),
});

export type SourceSelectionMode = z.infer<typeof sourceSelectionModeSchema>;
export type GroundingMode = z.infer<typeof groundingModeSchema>;
export type SourceSelection = z.infer<typeof sourceSelectionSchema>;
export type GroundingRequest = z.infer<typeof groundingRequestSchema>;
export type GroundingSnapshot = z.infer<typeof groundingSnapshotSchema>;

export const chatTriggerSchema = z.enum([
    "submit-message",
    "regenerate-message",
]);
export const messageFeedbackSchema = z.enum(["HELPFUL", "NOT_HELPFUL"]);
export const chatGuideSchema = z.object({
    overview: z.string().min(1),
    questions: z.array(z.string().min(1)).min(3).max(4),
    sourceIds: uniqueSourceIdsSchema.min(1),
});

export type ChatTrigger = z.infer<typeof chatTriggerSchema>;
export type MessageFeedback = z.infer<typeof messageFeedbackSchema>;
export type ChatGuide = z.infer<typeof chatGuideSchema>;

const citationBaseSchema = z.object({
    label: z.string().regex(/^(?:[1-9]\d*|W[1-9]\d*)$/),
    title: z.string().min(1),
    excerpt: z.string(),
    page: z.number().int().positive().optional(),
    chunkId: z.string().min(1).optional(),
    chunkIndex: z.number().int().nonnegative().optional(),
    timestamp: z.number().finite().nonnegative().optional(),
});

export const citationAvailabilitySchema = z.enum([
    "available",
    "source-unavailable",
    "chunk-unavailable",
]);

export const sourceCitationSchema = citationBaseSchema.extend({
    kind: z.literal("source"),
    sourceId: z.string().min(1),
    sourceType: sourceTypeSchema,
    provenance: z.object({
        provider: z.enum(["pinecone", "postgres", "hybrid"]),
        score: z.number().finite().optional(),
    }),
    availability: citationAvailabilitySchema.optional(),
});

export const webCitationSchema = citationBaseSchema.extend({
    kind: z.literal("web"),
    url: z.url({ protocol: /^https?$/ }),
    provenance: z.object({
        provider: z.literal("tavily"),
        query: z.string().min(1),
        score: z.number().finite().optional(),
    }),
});

export const citationSchema = z.discriminatedUnion("kind", [
    sourceCitationSchema,
    webCitationSchema,
]);

export const citationEnvelopeSchema = z.object({
    version: z.literal(1),
    items: z.array(citationSchema).refine(
        (items) => new Set(items.map((item) => item.label)).size === items.length,
        { message: "Citation labels must be unique" },
    ),
});

export type Citation = z.infer<typeof citationSchema>;
export type SourceCitation = z.infer<typeof sourceCitationSchema>;
export type WebCitation = z.infer<typeof webCitationSchema>;
export type CitationEnvelope = z.infer<typeof citationEnvelopeSchema>;
export type CitationAvailability = z.infer<typeof citationAvailabilitySchema>;

const sourceMetadataCommonSchema = z.object({
    processingError: z.string().min(1).optional(),
    failureCode: sourceFailureCodeSchema.optional(),
    chunkCount: z.number().int().nonnegative().optional(),
    indexedAt: z.iso.datetime().optional(),
    cleanupError: z.string().min(1).optional(),
});

export const transcriptSegmentSchema = z.object({
    text: z.string().min(1),
    offset: z.number().finite().nonnegative(),
    duration: z.number().finite().nonnegative(),
});

export const pdfSourceMetadataSchema = sourceMetadataCommonSchema.extend({
    fileUrl: z.url({ protocol: /^https?$/ }).optional(),
    fileName: z.string().min(1).optional(),
    fileSize: z.number().int().nonnegative().optional(),
    publicId: z.string().min(1).optional(),
    resourceType: z.enum(["raw", "image"]).optional(),
    pageCount: z.number().int().positive().optional(),
    safetyCheck: z.literal("pdf-signature-verified").optional(),
});

export const websiteSourceMetadataSchema = sourceMetadataCommonSchema.extend({
    importedFrom: z.string().min(1).optional(),
    sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
});

export const youtubeSourceMetadataSchema = sourceMetadataCommonSchema.extend({
    videoId: z.string().regex(/^[\w-]{11}$/).optional(),
    transcriptSegments: z.array(transcriptSegmentSchema).optional(),
});

export const textSourceMetadataSchema = sourceMetadataCommonSchema;

/** Container formats accepted for an audio source upload. */
export const SOURCE_AUDIO_MIME_TYPES: readonly string[] = [
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
    "audio/flac",
];

export const audioSourceMetadataSchema = sourceMetadataCommonSchema.extend({
    fileUrl: z.url({ protocol: /^https?$/ }).optional(),
    fileName: z.string().min(1).optional(),
    fileSize: z.number().int().nonnegative().optional(),
    publicId: z.string().min(1).optional(),
    resourceType: z.literal("video").optional(),
    /**
     * Container extension the object was stored with, resolved from the file's
     * own bytes. The uploaded filename can disagree with them, so this — not the
     * extension — is what a signed delivery URL must be built from.
     */
    storageFormat: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    durationMs: z.number().int().nonnegative().optional(),
    /** Language the transcription provider detected, when it reports one. */
    detectedLanguage: z.string().min(1).optional(),
    transcriptProvider: z.string().min(1).optional(),
    transcriptSegments: z.array(transcriptSegmentSchema).optional(),
    safetyCheck: z.literal("audio-container-verified").optional(),
});

export const storedSourceMetadataSchema = sourceMetadataCommonSchema.extend({
    fileUrl: z.url({ protocol: /^https?$/ }).optional(),
    fileName: z.string().min(1).optional(),
    fileSize: z.number().int().nonnegative().optional(),
    publicId: z.string().min(1).optional(),
    resourceType: z.enum(["raw", "image", "video"]).optional(),
    pageCount: z.number().int().positive().optional(),
    safetyCheck: z
        .enum(["pdf-signature-verified", "audio-container-verified"])
        .optional(),
    importedFrom: z.string().min(1).optional(),
    sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
    videoId: z.string().regex(/^[\w-]{11}$/).optional(),
    storageFormat: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    durationMs: z.number().int().nonnegative().optional(),
    detectedLanguage: z.string().min(1).optional(),
    transcriptProvider: z.string().min(1).optional(),
    transcriptSegments: z.array(transcriptSegmentSchema).optional(),
});

const sourceRecordBaseSchema = z.object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    title: z.string().min(1),
    content: z.string().nullable(),
    url: z.url({ protocol: /^https?$/ }).nullable(),
    status: sourceStatusSchema,
    processingStage: sourceProcessingStageSchema,
    processingVersion: z.number().int().positive(),
    contentChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
});

export const sourceSchema = z.discriminatedUnion("type", [
    sourceRecordBaseSchema.extend({
        type: z.literal("PDF"),
        metadata: pdfSourceMetadataSchema.nullable(),
    }),
    sourceRecordBaseSchema.extend({
        type: z.literal("WEBSITE"),
        metadata: websiteSourceMetadataSchema.nullable(),
    }),
    sourceRecordBaseSchema.extend({
        type: z.literal("YOUTUBE"),
        metadata: youtubeSourceMetadataSchema.nullable(),
    }),
    sourceRecordBaseSchema.extend({
        type: z.literal("TEXT"),
        metadata: textSourceMetadataSchema.nullable(),
    }),
    sourceRecordBaseSchema.extend({
        type: z.literal("MARKDOWN"),
        metadata: textSourceMetadataSchema.nullable(),
    }),
    sourceRecordBaseSchema.extend({
        type: z.literal("AUDIO"),
        metadata: audioSourceMetadataSchema.nullable(),
    }),
]);

export const sourceChunkMetadataSchema = z.object({
    page: z.number().int().positive().optional(),
    timestamp: z.number().finite().nonnegative().optional(),
    endTimestamp: z.number().finite().nonnegative().optional(),
});

export const sourceChunkSchema = z.object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    index: z.number().int().nonnegative(),
    content: z.string(),
    tokenCount: z.number().int().nonnegative().nullable(),
    metadata: sourceChunkMetadataSchema.nullable(),
    processingVersion: z.number().int().positive(),
    createdAt: z.iso.datetime(),
});

export const sourceChunksResponseSchema = z.object({
    source: sourceSchema,
    chunks: z.array(sourceChunkSchema),
    count: z.number().int().nonnegative(),
});

export type Source = z.infer<typeof sourceSchema>;
export type SourceChunk = z.infer<typeof sourceChunkSchema>;
export type SourceChunkMetadata = z.infer<typeof sourceChunkMetadataSchema>;
export type SourceChunksResponse = z.infer<typeof sourceChunksResponseSchema>;
export type StoredSourceMetadata = z.infer<typeof storedSourceMetadataSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export const apiErrorResponseSchema = z.object({
    error: z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        requestId: z.string().min(1),
        details: z.json().optional(),
    }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type JsonValue = z.infer<typeof z.json>;

/**
 * JSON as read back from a database driver or `JSON.parse`, where object
 * members may be absent. Use it for values that are about to be validated.
 */
export type JsonReadValue =
    | string
    | number
    | boolean
    | null
    | readonly JsonReadValue[]
    | { readonly [key: string]: JsonReadValue | undefined };

/* -------------------------------------------------------------------------- */
/*                              Studio outputs                                */
/* -------------------------------------------------------------------------- */

export const OUTPUT_TITLE_MAX_LENGTH = 120;
export const OUTPUT_FOCUS_MAX_LENGTH = 500;
export const OUTPUT_CONTENT_VERSION = 1;
export const OUTPUT_METADATA_VERSION = 1;
export const OUTPUT_MAX_GENERATION_ATTEMPTS = 3;

export const outputTypeSchema = z.enum([
    "SUMMARY",
    "TAKEAWAYS",
    "FLASHCARDS",
    "QUIZ",
    "MINDMAP",
    "REPORT",
    "STUDY_GUIDE",
    "FAQ",
    "TIMELINE",
    "BRIEFING",
    "AUDIO_OVERVIEW",
    "SLIDES",
    "DATA_TABLE",
    "VIDEO_EXPLAINER",
]);

export const outputStatusSchema = z.enum([
    "PENDING",
    "PROCESSING",
    "READY",
    "FAILED",
    "CANCELLED",
]);

/**
 * Where an output currently is inside its pipeline.
 *
 * Text outputs move `QUEUED → GENERATING → READY|FAILED`. Audio Overviews
 * additionally expose `SCRIPTING → SYNTHESIS → ASSEMBLY`, so a reader watching
 * a multi-minute job can see it progress and so a retry knows what already
 * finished.
 */
export const outputGenerationStageSchema = z.enum([
    "QUEUED",
    "GENERATING",
    "SCRIPTING",
    "SYNTHESIS",
    "ASSEMBLY",
    "READY",
    "FAILED",
]);

export const outputGroupSchema = z.enum([
    "featured-media",
    "study",
    "writing",
    "saved",
]);

export type OutputType = z.infer<typeof outputTypeSchema>;
export type OutputStatus = z.infer<typeof outputStatusSchema>;
export type OutputGenerationStage = z.infer<typeof outputGenerationStageSchema>;
export type OutputGroup = z.infer<typeof outputGroupSchema>;

/** Studio shelf each output type belongs to before saved-output overrides. */
export const OUTPUT_TYPE_GROUP: Record<OutputType, OutputGroup> = {
    SUMMARY: "writing",
    TAKEAWAYS: "study",
    FLASHCARDS: "study",
    QUIZ: "study",
    MINDMAP: "study",
    REPORT: "writing",
    STUDY_GUIDE: "study",
    FAQ: "writing",
    TIMELINE: "writing",
    BRIEFING: "writing",
    AUDIO_OVERVIEW: "featured-media",
    VIDEO_EXPLAINER: "featured-media",
    SLIDES: "writing",
    DATA_TABLE: "writing",
};

export const OUTPUT_TYPES: readonly OutputType[] = outputTypeSchema.options;

/**
 * Output types whose generated content the reader may edit in place.
 *
 * Editing is only offered for structured outputs whose shape survives a
 * round-trip through the same schema the generator produced, so an edit can
 * never leave content the viewers cannot render.
 */
export const EDITABLE_OUTPUT_TYPES: readonly OutputType[] = [
    "SLIDES",
    "DATA_TABLE",
];

/** Whether {@link EDITABLE_OUTPUT_TYPES} covers a type. */
export function isEditableOutputType(type: OutputType): boolean {
    return EDITABLE_OUTPUT_TYPES.includes(type);
}

export const outputLengthSchema = z.enum(["short", "standard", "deep"]);
export const outputLocaleSchema = z
    .string()
    .trim()
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/, "Use a language code such as en or en-GB");

export type OutputLength = z.infer<typeof outputLengthSchema>;

const outputFocusSchema = z
    .string()
    .trim()
    .min(1)
    .max(OUTPUT_FOCUS_MAX_LENGTH);

/** How an Audio Overview is written and performed. */
export const audioOverviewStyleSchema = z.enum([
    "narration",
    "dialogue",
    "briefing",
]);

/**
 * Provider-neutral voice character. Each TTS adapter maps a profile onto its
 * own catalogue, so switching vendors never changes this contract.
 */
export const audioVoiceProfileSchema = z.enum(["neutral", "warm", "bright"]);

/** Who delivers a script segment. Only `dialogue` uses `guest`. */
export const audioSpeakerSchema = z.enum(["host", "guest"]);

export type AudioOverviewStyle = z.infer<typeof audioOverviewStyleSchema>;
export type AudioVoiceProfile = z.infer<typeof audioVoiceProfileSchema>;
export type AudioSpeaker = z.infer<typeof audioSpeakerSchema>;

/** Audio-only generation options; ignored by every other output type. */
export const audioOverviewOptionsSchema = z.object({
    style: audioOverviewStyleSchema,
    voice: audioVoiceProfileSchema,
});

export type AudioOverviewOptions = z.infer<typeof audioOverviewOptionsSchema>;

/** Applied when a reader creates an Audio Overview without choosing options. */
export const DEFAULT_AUDIO_OVERVIEW_OPTIONS: AudioOverviewOptions = {
    style: "narration",
    voice: "warm",
};

/** Client-supplied generation options; defaults are applied on parse. */
export const outputGenerationOptionsInputSchema = z.object({
    length: outputLengthSchema.default("standard"),
    locale: outputLocaleSchema.default("en"),
    focus: outputFocusSchema.optional(),
    audio: audioOverviewOptionsSchema.optional(),
});

/** Persisted, versioned generation options snapshot. */
export const outputGenerationOptionsSchema = z.object({
    version: z.literal(1),
    length: outputLengthSchema,
    locale: outputLocaleSchema,
    focus: outputFocusSchema.optional(),
    audio: audioOverviewOptionsSchema.optional(),
});

export type OutputGenerationOptionsInput = z.infer<
    typeof outputGenerationOptionsInputSchema
>;
/** Options as sent by a client, before defaults are applied. */
export type OutputGenerationOptionsRequest = z.input<
    typeof outputGenerationOptionsInputSchema
>;
export type OutputGenerationOptions = z.infer<
    typeof outputGenerationOptionsSchema
>;

export const createOutputRequestSchema = z.intersection(
    z.object({
        type: outputTypeSchema,
        title: z.string().trim().min(1).max(OUTPUT_TITLE_MAX_LENGTH).optional(),
        options: outputGenerationOptionsInputSchema.optional(),
    }),
    sourceSelectionSchema,
);

export const renameOutputRequestSchema = z.object({
    title: z.string().trim().min(1).max(OUTPUT_TITLE_MAX_LENGTH),
});

export type CreateOutputRequest = z.infer<typeof createOutputRequestSchema>;
export type RenameOutputRequest = z.infer<typeof renameOutputRequestSchema>;

export const outputSourceSnapshotSchema = z.object({
    version: z.literal(1),
    capturedAt: z.iso.datetime(),
    selectionMode: sourceSelectionModeSchema,
    sources: z
        .array(
            z.object({
                id: z.string().min(1),
                title: z.string().min(1),
                type: sourceTypeSchema,
                processingVersion: z.number().int().positive(),
            }),
        )
        .min(1),
});

export const outputFailureStageSchema = z.enum([
    "SOURCE_RESOLUTION",
    "CONTEXT_ASSEMBLY",
    "GENERATION",
    "VALIDATION",
    "SCRIPTING",
    "SYNTHESIS",
    "ASSEMBLY",
    "STORAGE",
]);

export const outputFailureCodeSchema = z.enum([
    "SOURCES_UNAVAILABLE",
    "NO_SOURCE_CONTENT",
    "GENERATION_FAILED",
    "INVALID_MODEL_OUTPUT",
    "UNSUPPORTED_OUTPUT_TYPE",
    "AUDIO_UNAVAILABLE",
    "SCRIPT_NOT_GROUNDED",
    "SYNTHESIS_FAILED",
    "AUDIO_ASSEMBLY_FAILED",
    "AUDIO_STORAGE_FAILED",
    "VIDEO_UNAVAILABLE",
    "STORYBOARD_NOT_GROUNDED",
]);

/**
 * Inline marker a generated writing output may use to attribute a statement to
 * one of its sources, e.g. `[S1]`.
 */
export const outputSourceLabelSchema = z.object({
    label: z.string().regex(/^S[1-9]\d*$/),
    sourceId: z.string().min(1),
    title: z.string().min(1),
});

export const outputMetricsSchema = z.object({
    contextChars: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    attempts: z.number().int().positive(),
    /** Absent when a failure stopped generation before the count was known. */
    repairAttempts: z.number().int().nonnegative().optional(),
});

/**
 * Compact Audio Overview facts denormalized onto the output row.
 *
 * `content.media` stays authoritative; this exists so a Studio card can show
 * duration and language without parsing a full script, and so a retry knows
 * whether the persisted script still matches the requested sources and options.
 */
export const outputAudioSummarySchema = z.object({
    style: audioOverviewStyleSchema,
    voice: audioVoiceProfileSchema,
    language: outputLocaleSchema,
    segmentCount: z.number().int().positive(),
    durationMs: z.number().int().nonnegative().optional(),
    scriptFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});

export type OutputAudioSummary = z.infer<typeof outputAudioSummarySchema>;

/**
 * Compact video-explainer facts denormalized onto the output row.
 *
 * Mirrors {@link outputAudioSummarySchema}: `content.media` stays authoritative,
 * while a Studio card reads duration, language, and scene count without parsing
 * a full storyboard, and a retry learns whether the persisted storyboard still
 * matches the requested sources and options.
 */
export const outputVideoSummarySchema = z.object({
    voice: audioVoiceProfileSchema,
    language: outputLocaleSchema,
    sceneCount: z.number().int().positive(),
    durationMs: z.number().int().nonnegative().optional(),
    storyboardFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});

export type OutputVideoSummary = z.infer<typeof outputVideoSummarySchema>;

export const outputMetadataSchema = z.object({
    version: z.literal(OUTPUT_METADATA_VERSION),
    generatedAt: z.iso.datetime().optional(),
    provider: z.literal("openai").optional(),
    model: z.string().min(1).optional(),
    options: outputGenerationOptionsSchema.optional(),
    sourceSnapshot: outputSourceSnapshotSchema.optional(),
    sourceLabels: z.array(outputSourceLabelSchema).optional(),
    audio: outputAudioSummarySchema.optional(),
    video: outputVideoSummarySchema.optional(),
    /** Set when the reader last edited the generated content by hand. */
    editedAt: z.iso.datetime().optional(),
    metrics: outputMetricsSchema.optional(),
    failure: z
        .object({
            stage: outputFailureStageSchema,
            code: outputFailureCodeSchema,
            message: z.string().min(1),
        })
        .optional(),
    savedFrom: z
        .object({
            conversationId: z.string().min(1),
            messageId: z.string().min(1),
        })
        .optional(),
    duplicatedFromOutputId: z.string().min(1).optional(),
});

/**
 * Metadata written before Phase 7 introduced the versioned envelope. Kept so
 * existing outputs still render their failure reason and saved-answer origin.
 */
const legacyOutputMetadataSchema = z.object({
    processingError: z.string().min(1).optional(),
    generatedAt: z.string().min(1).optional(),
    savedFromConversationId: z.string().min(1).optional(),
    savedFromMessageId: z.string().min(1).optional(),
});

export type OutputSourceSnapshot = z.infer<typeof outputSourceSnapshotSchema>;
export type OutputSourceLabel = z.infer<typeof outputSourceLabelSchema>;
export type OutputFailureStage = z.infer<typeof outputFailureStageSchema>;
export type OutputFailureCode = z.infer<typeof outputFailureCodeSchema>;
export type OutputMetrics = z.infer<typeof outputMetricsSchema>;
export type OutputMetadata = z.infer<typeof outputMetadataSchema>;

/**
 * Reads persisted output metadata, upgrading pre-Phase-7 records in memory so
 * readers never have to branch on record age.
 *
 * @param value - Raw `metadata` JSON column value
 * @returns Versioned metadata, or `null` when the column holds nothing usable
 */
export function readOutputMetadata(
    value: JsonReadValue | undefined,
): OutputMetadata | null {
    if (value === null || value === undefined) {
        return null;
    }

    const versioned = outputMetadataSchema.safeParse(value);
    if (versioned.success) {
        return versioned.data;
    }

    const legacy = legacyOutputMetadataSchema.safeParse(value);
    if (!legacy.success) {
        return null;
    }

    const { processingError, savedFromConversationId, savedFromMessageId } =
        legacy.data;

    return {
        version: OUTPUT_METADATA_VERSION,
        ...(processingError
            ? {
                  failure: {
                      stage: outputFailureStageSchema.enum.GENERATION,
                      code: outputFailureCodeSchema.enum.GENERATION_FAILED,
                      message: processingError,
                  },
              }
            : {}),
        ...(savedFromConversationId && savedFromMessageId
            ? {
                  savedFrom: {
                      conversationId: savedFromConversationId,
                      messageId: savedFromMessageId,
                  },
              }
            : {}),
    };
}

/* ----------------------------- Output content ----------------------------- */

export const summaryOutputContentSchema = z.object({
    markdown: z.string().trim().min(1),
});

export const takeawaysOutputContentSchema = z.object({
    items: z.array(z.string().trim().min(1)).min(3).max(20),
});

export const flashcardsOutputContentSchema = z.object({
    cards: z
        .array(
            z.object({
                front: z.string().trim().min(1),
                back: z.string().trim().min(1),
            }),
        )
        .min(3)
        .max(30),
});

export const quizOutputContentSchema = z.object({
    questions: z
        .array(
            z
                .object({
                    question: z.string().trim().min(1),
                    options: z.array(z.string().trim().min(1)).min(2).max(5),
                    correctIndex: z.number().int().nonnegative(),
                    explanation: z.string().trim().min(1),
                })
                .refine(
                    (question) => question.correctIndex < question.options.length,
                    { message: "correctIndex must point at an existing option" },
                ),
        )
        .min(3)
        .max(15),
});

export const mindmapOutputContentSchema = z.object({
    nodes: z
        .array(
            z.object({
                id: z.string().trim().min(1),
                label: z.string().trim().min(1),
            }),
        )
        .min(2)
        .max(40),
    edges: z.array(
        z.object({
            id: z.string().trim().min(1),
            source: z.string().trim().min(1),
            target: z.string().trim().min(1),
        }),
    ),
});

export const reportOutputContentSchema = z.object({
    markdown: z.string().trim().min(1),
    sections: z.array(
        z.object({
            title: z.string().trim().min(1),
            content: z.string().trim().min(1),
        }),
    ),
});

export const studyGuideOutputContentSchema = z.object({
    overview: z.string().trim().min(1),
    sections: z
        .array(
            z.object({
                title: z.string().trim().min(1),
                summary: z.string().trim().min(1),
                keyPoints: z.array(z.string().trim().min(1)).min(1).max(10),
                studyPrompts: z.array(z.string().trim().min(1)).max(5),
            }),
        )
        .min(1)
        .max(12),
    glossary: z
        .array(
            z.object({
                term: z.string().trim().min(1),
                definition: z.string().trim().min(1),
            }),
        )
        .max(30),
});

export const faqOutputContentSchema = z.object({
    items: z
        .array(
            z.object({
                question: z.string().trim().min(1),
                answer: z.string().trim().min(1),
            }),
        )
        .min(3)
        .max(25),
});

export const timelineOutputContentSchema = z.object({
    events: z
        .array(
            z.object({
                label: z.string().trim().min(1),
                when: z.string().trim().min(1),
                description: z.string().trim().min(1),
            }),
        )
        .min(2)
        .max(40),
});

export const briefingOutputContentSchema = z.object({
    headline: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    keyPoints: z.array(z.string().trim().min(1)).min(3).max(12),
    decisions: z.array(z.string().trim().min(1)).max(10),
    risks: z.array(z.string().trim().min(1)).max(10),
    nextSteps: z.array(z.string().trim().min(1)).max(10),
});

/* ------------------------ Structured deliverables ------------------------- */

/**
 * Inline attribution marker a generated output may carry, e.g. `S1`.
 *
 * Structured outputs attach labels to the slide, row, or scene they support
 * rather than embedding them in prose, so a reader can open the evidence behind
 * one specific claim.
 */
export const OUTPUT_SOURCE_LABEL_PATTERN = /^S[1-9]\d*$/;

/** Upper bound on labels attached to a single structured element. */
export const OUTPUT_SOURCE_LABELS_MAX = 6;

const structuredSourceLabelsSchema = z
    .array(z.string().regex(OUTPUT_SOURCE_LABEL_PATTERN))
    .max(OUTPUT_SOURCE_LABELS_MAX)
    .refine(
        (labels) => new Set(labels).size === labels.length,
        "Source labels must be unique",
    );

export const SLIDES_CONTENT_VERSION = 1;
export const SLIDE_MIN = 3;
export const SLIDE_MAX = 30;
export const SLIDE_BULLET_MAX = 6;
export const SLIDE_TITLE_MAX_LENGTH = 120;
export const SLIDE_BULLET_MAX_LENGTH = 300;
export const SLIDE_NOTES_MAX_LENGTH = 1_200;

const slideIdSchema = z.string().regex(/^sl[1-9]\d*$/);

export const slideSchema = z.object({
    id: slideIdSchema,
    title: z.string().trim().min(1).max(SLIDE_TITLE_MAX_LENGTH),
    bullets: z
        .array(z.string().trim().min(1).max(SLIDE_BULLET_MAX_LENGTH))
        .min(1)
        .max(SLIDE_BULLET_MAX),
    /** Presenter guidance. Never spoken by a synthesizer, unlike a scene. */
    speakerNotes: z.string().trim().min(1).max(SLIDE_NOTES_MAX_LENGTH).optional(),
    sourceLabels: structuredSourceLabelsSchema,
});

export const slideDeckSchema = z.object({
    title: z.string().trim().min(1).max(SLIDE_TITLE_MAX_LENGTH),
    subtitle: z.string().trim().min(1).max(SLIDE_TITLE_MAX_LENGTH).optional(),
    slides: z
        .array(slideSchema)
        .min(SLIDE_MIN)
        .max(SLIDE_MAX)
        .refine(
            (slides) =>
                new Set(slides.map((slide) => slide.id)).size === slides.length,
            "Slide ids must be unique",
        ),
});

export const slidesOutputContentSchema = z.object({
    version: z.literal(SLIDES_CONTENT_VERSION),
    deck: slideDeckSchema,
});

export const DATA_TABLE_CONTENT_VERSION = 1;
export const DATA_TABLE_MAX = 6;
export const DATA_TABLE_COLUMN_MAX = 8;
export const DATA_TABLE_ROW_MAX = 200;
export const DATA_TABLE_CELL_MAX_LENGTH = 500;

const dataTableIdSchema = z.string().regex(/^t[1-9]\d*$/);
const dataTableRowIdSchema = z.string().regex(/^r[1-9]\d*$/);

/**
 * How a column should be read. Purely presentational: every cell is persisted
 * as the text the sources used, so a date or figure is never silently reformatted
 * into something the sources do not say.
 */
export const dataTableColumnKindSchema = z.enum(["text", "number", "date"]);

export const dataTableColumnSchema = z.object({
    label: z.string().trim().min(1).max(SLIDE_TITLE_MAX_LENGTH),
    kind: dataTableColumnKindSchema,
});

export const dataTableRowSchema = z.object({
    id: dataTableRowIdSchema,
    cells: z
        .array(z.string().trim().max(DATA_TABLE_CELL_MAX_LENGTH))
        .min(1)
        .max(DATA_TABLE_COLUMN_MAX),
    sourceLabels: structuredSourceLabelsSchema,
});

export const dataTableSchema = z
    .object({
        id: dataTableIdSchema,
        title: z.string().trim().min(1).max(SLIDE_TITLE_MAX_LENGTH),
        caption: z.string().trim().min(1).max(SLIDE_NOTES_MAX_LENGTH).optional(),
        columns: z
            .array(dataTableColumnSchema)
            .min(1)
            .max(DATA_TABLE_COLUMN_MAX),
        rows: z.array(dataTableRowSchema).min(1).max(DATA_TABLE_ROW_MAX),
    })
    .refine(
        (table) =>
            table.rows.every((row) => row.cells.length === table.columns.length),
        "Every row must have one cell per column",
    )
    .refine(
        (table) =>
            new Set(table.rows.map((row) => row.id)).size === table.rows.length,
        "Row ids must be unique",
    );

export const dataTableOutputContentSchema = z.object({
    version: z.literal(DATA_TABLE_CONTENT_VERSION),
    tables: z.array(dataTableSchema).min(1).max(DATA_TABLE_MAX),
});

export type Slide = z.infer<typeof slideSchema>;
export type SlideDeck = z.infer<typeof slideDeckSchema>;
export type SlidesOutputContent = z.infer<typeof slidesOutputContentSchema>;
export type DataTable = z.infer<typeof dataTableSchema>;
export type DataTableColumn = z.infer<typeof dataTableColumnSchema>;
export type DataTableColumnKind = z.infer<typeof dataTableColumnKindSchema>;
export type DataTableRow = z.infer<typeof dataTableRowSchema>;
export type DataTableOutputContent = z.infer<
    typeof dataTableOutputContentSchema
>;

/**
 * A reader's hand edit of generated content.
 *
 * The payload is the same shape the generator produces, so an edited output is
 * indistinguishable from a generated one to every viewer and exporter. Only the
 * types in {@link EDITABLE_OUTPUT_TYPES} appear here.
 */
export const editOutputContentRequestSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("SLIDES"),
        deck: slideDeckSchema,
    }),
    z.object({
        type: z.literal("DATA_TABLE"),
        tables: z.array(dataTableSchema).min(1).max(DATA_TABLE_MAX),
    }),
]);

export type EditOutputContentRequest = z.infer<
    typeof editOutputContentRequestSchema
>;

/* --------------------------- Audio Overview ------------------------------- */

export const AUDIO_OVERVIEW_CONTENT_VERSION = 1;
export const AUDIO_OVERVIEW_SEGMENT_MIN = 2;
export const AUDIO_OVERVIEW_SEGMENT_MAX = 40;
/** Kept below the smallest per-request input limit across TTS vendors. */
export const AUDIO_SEGMENT_TEXT_MAX_LENGTH = 1_200;
export const AUDIO_SEGMENT_SOURCE_LABELS_MAX = 6;

const audioSegmentIdSchema = z.string().regex(/^s[1-9]\d*$/);

/**
 * One spoken beat of an Audio Overview.
 *
 * Citations are structural rather than inline: a listener cannot hear `[S1]`,
 * so the labels are attached to the segment and surfaced next to the transcript.
 */
export const audioOverviewSegmentSchema = z.object({
    id: audioSegmentIdSchema,
    speaker: audioSpeakerSchema,
    text: z.string().trim().min(1).max(AUDIO_SEGMENT_TEXT_MAX_LENGTH),
    sourceLabels: z
        .array(z.string().regex(/^S[1-9]\d*$/))
        .max(AUDIO_SEGMENT_SOURCE_LABELS_MAX)
        .refine(
            (labels) => new Set(labels).size === labels.length,
            "Segment source labels must be unique",
        ),
});

export const audioOverviewScriptSchema = z.object({
    style: audioOverviewStyleSchema,
    language: outputLocaleSchema,
    segments: z
        .array(audioOverviewSegmentSchema)
        .min(AUDIO_OVERVIEW_SEGMENT_MIN)
        .max(AUDIO_OVERVIEW_SEGMENT_MAX)
        .refine(
            (segments) =>
                new Set(segments.map((segment) => segment.id)).size ===
                segments.length,
            "Segment ids must be unique",
        )
        .refine(
            (segments) =>
                segments.some((segment) => segment.sourceLabels.length > 0),
            "At least one segment must cite a source",
        ),
});

/** Where a segment starts and ends inside the assembled audio file. */
export const audioSegmentTimingSchema = z
    .object({
        segmentId: audioSegmentIdSchema,
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().nonnegative(),
    })
    .refine((timing) => timing.endMs >= timing.startMs, {
        message: "A segment cannot end before it starts",
    });

export const audioMediaSchema = z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    voiceProfile: audioVoiceProfileSchema,
    /** Vendor voice ids actually used, kept for reproducibility. */
    voices: z.array(z.string().min(1)).min(1),
    format: z.literal("mp3"),
    bytes: z.number().int().positive(),
    durationMs: z.number().int().nonnegative(),
    storage: z.object({
        provider: z.literal("cloudinary"),
        publicId: z.string().min(1),
        resourceType: z.literal("video"),
    }),
    synthesizedAt: z.iso.datetime(),
});

/**
 * Audio Overview content.
 *
 * `media` and `timings` are absent while the script exists but synthesis has
 * not finished, which is exactly what a retry-from-stage reads back.
 */
export const audioOverviewOutputContentSchema = z.object({
    version: z.literal(AUDIO_OVERVIEW_CONTENT_VERSION),
    script: audioOverviewScriptSchema,
    timings: z.array(audioSegmentTimingSchema).optional(),
    media: audioMediaSchema.optional(),
});

/** Audio Overview content that has finished synthesis and can be played. */
export const playableAudioOverviewContentSchema =
    audioOverviewOutputContentSchema.extend({
        timings: z.array(audioSegmentTimingSchema).min(1),
        media: audioMediaSchema,
    });

export type AudioOverviewSegment = z.infer<typeof audioOverviewSegmentSchema>;
export type AudioOverviewScript = z.infer<typeof audioOverviewScriptSchema>;
export type AudioSegmentTiming = z.infer<typeof audioSegmentTimingSchema>;
export type AudioMedia = z.infer<typeof audioMediaSchema>;
export type AudioOverviewOutputContent = z.infer<
    typeof audioOverviewOutputContentSchema
>;
export type PlayableAudioOverviewContent = z.infer<
    typeof playableAudioOverviewContentSchema
>;

/**
 * Reads Audio Overview content that is ready to play.
 *
 * @param value - Raw `content` JSON column value
 * @returns Content with media and timings, or `null` when it is not playable
 */
export function parsePlayableAudioOverview(
    value: JsonReadValue | undefined,
): PlayableAudioOverviewContent | null {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = playableAudioOverviewContentSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/** Short-lived, signed access to an Audio Overview's stored media. */
export const outputAudioAccessSchema = z.object({
    version: z.literal(1),
    /** Signed delivery URL an `<audio>` element can stream with range requests. */
    playbackUrl: z.url({ protocol: /^https$/ }),
    /** Signed, time-limited URL that saves the file. */
    downloadUrl: z.url({ protocol: /^https$/ }),
    expiresAt: z.iso.datetime(),
    format: z.literal("mp3"),
    bytes: z.number().int().positive(),
    durationMs: z.number().int().nonnegative(),
});

export type OutputAudioAccess = z.infer<typeof outputAudioAccessSchema>;

/* ------------------------- Video-style explainer -------------------------- */

export const VIDEO_EXPLAINER_CONTENT_VERSION = 1;
export const VIDEO_SCENE_MIN = 3;
export const VIDEO_SCENE_MAX = 24;
export const VIDEO_SCENE_BULLET_MAX = 5;
/** Narration length ceiling, matching the audio segment limit it is spoken as. */
export const VIDEO_NARRATION_MAX_LENGTH = AUDIO_SEGMENT_TEXT_MAX_LENGTH;

/**
 * Scene ids share the audio segment id space on purpose: a scene's narration is
 * one synthesized segment, so {@link audioSegmentTimingSchema} times both.
 */
const videoSceneIdSchema = z.string().regex(/^s[1-9]\d*$/);

/**
 * One beat of a narrated explainer: what is on screen, and what is said over it.
 *
 * The on-screen text and the narration are separate fields because a caption
 * track must repeat what was spoken, not what was displayed.
 */
export const videoSceneSchema = z.object({
    id: videoSceneIdSchema,
    title: z.string().trim().min(1).max(SLIDE_TITLE_MAX_LENGTH),
    bullets: z
        .array(z.string().trim().min(1).max(SLIDE_BULLET_MAX_LENGTH))
        .min(1)
        .max(VIDEO_SCENE_BULLET_MAX),
    narration: z.string().trim().min(1).max(VIDEO_NARRATION_MAX_LENGTH),
    sourceLabels: structuredSourceLabelsSchema,
});

export const videoStoryboardSchema = z.object({
    title: z.string().trim().min(1).max(SLIDE_TITLE_MAX_LENGTH),
    language: outputLocaleSchema,
    scenes: z
        .array(videoSceneSchema)
        .min(VIDEO_SCENE_MIN)
        .max(VIDEO_SCENE_MAX)
        .refine(
            (scenes) =>
                new Set(scenes.map((scene) => scene.id)).size === scenes.length,
            "Scene ids must be unique",
        )
        .refine(
            (scenes) => scenes.some((scene) => scene.sourceLabels.length > 0),
            "At least one scene must cite a source",
        ),
});

/**
 * Video-explainer content.
 *
 * `media` and `timings` are absent while the storyboard exists but narration has
 * not been synthesized, which is what a retry-from-stage reads back.
 */
export const videoExplainerOutputContentSchema = z.object({
    version: z.literal(VIDEO_EXPLAINER_CONTENT_VERSION),
    storyboard: videoStoryboardSchema,
    timings: z.array(audioSegmentTimingSchema).optional(),
    media: audioMediaSchema.optional(),
});

/** Video-explainer content that has finished synthesis and can be played. */
export const playableVideoExplainerContentSchema =
    videoExplainerOutputContentSchema.extend({
        timings: z.array(audioSegmentTimingSchema).min(1),
        media: audioMediaSchema,
    });

export type VideoScene = z.infer<typeof videoSceneSchema>;
export type VideoStoryboard = z.infer<typeof videoStoryboardSchema>;
export type VideoExplainerOutputContent = z.infer<
    typeof videoExplainerOutputContentSchema
>;
export type PlayableVideoExplainerContent = z.infer<
    typeof playableVideoExplainerContentSchema
>;

/**
 * Reads video-explainer content that is ready to play.
 *
 * @param value - Raw `content` JSON column value
 * @returns Content with media and timings, or `null` when it is not playable
 */
export function parsePlayableVideoExplainer(
    value: JsonReadValue | undefined,
): PlayableVideoExplainerContent | null {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = playableVideoExplainerContentSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

/** One caption cue in playback order. */
export type CaptionCue = {
    id: string;
    startMs: number;
    endMs: number;
    text: string;
};

/**
 * Pairs each scene's narration with the slice of audio it was spoken over.
 *
 * @param content - Playable video-explainer content
 * @returns Cues in playback order, skipping scenes that were never timed
 */
export function videoExplainerCaptionCues(
    content: PlayableVideoExplainerContent,
): CaptionCue[] {
    const narrationById = new Map(
        content.storyboard.scenes.map((scene) => [scene.id, scene.narration]),
    );

    return content.timings.flatMap((timing) => {
        const text = narrationById.get(timing.segmentId);
        return text === undefined
            ? []
            : [
                  {
                      id: timing.segmentId,
                      startMs: timing.startMs,
                      endMs: timing.endMs,
                      text,
                  },
              ];
    });
}

function formatVttTimestamp(milliseconds: number): string {
    const total = Math.max(0, Math.round(milliseconds));
    const hours = Math.floor(total / 3_600_000);
    const minutes = Math.floor((total % 3_600_000) / 60_000);
    const seconds = Math.floor((total % 60_000) / 1_000);
    const millis = total % 1_000;

    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        `${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`,
    ].join(":");
}

/**
 * Renders cues as a WebVTT document a `<track>` element can consume.
 *
 * Cue text is flattened to a single line because a blank line ends a cue and
 * `-->` would start a new timing row; neither may come from generated prose.
 *
 * @param cues - Cues in playback order
 * @returns A complete WebVTT document
 */
export function buildWebVtt(cues: readonly CaptionCue[]): string {
    const blocks = cues.map((cue) => {
        const text = cue.text
            .replace(/\s+/g, " ")
            .replace(/-->/g, "→")
            .trim();

        return [
            cue.id,
            `${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)}`,
            text,
        ].join("\n");
    });

    return ["WEBVTT", "", ...blocks.map((block) => `${block}\n`)].join("\n");
}

/**
 * Optional features this deployment can actually deliver.
 *
 * Studio reads this so a tool is never offered as if it worked when the
 * providers behind it are not configured.
 */
export const studioCapabilitiesSchema = z.object({
    version: z.literal(1),
    audioOverview: z.boolean(),
    videoExplainer: z.boolean(),
    /** Whether an audio file can be uploaded and transcribed as a source. */
    audioSources: z.boolean(),
});

export type StudioCapabilities = z.infer<typeof studioCapabilitiesSchema>;

export type SummaryOutputContent = z.infer<typeof summaryOutputContentSchema>;
export type TakeawaysOutputContent = z.infer<
    typeof takeawaysOutputContentSchema
>;
export type FlashcardsOutputContent = z.infer<
    typeof flashcardsOutputContentSchema
>;
export type QuizOutputContent = z.infer<typeof quizOutputContentSchema>;
export type MindmapOutputContent = z.infer<typeof mindmapOutputContentSchema>;
export type ReportOutputContent = z.infer<typeof reportOutputContentSchema>;
export type StudyGuideOutputContent = z.infer<
    typeof studyGuideOutputContentSchema
>;
export type FaqOutputContent = z.infer<typeof faqOutputContentSchema>;
export type TimelineOutputContent = z.infer<typeof timelineOutputContentSchema>;
export type BriefingOutputContent = z.infer<typeof briefingOutputContentSchema>;

/** Output content tagged with the type it was generated for. */
export type OutputContent =
    | { type: "SUMMARY"; data: SummaryOutputContent }
    | { type: "TAKEAWAYS"; data: TakeawaysOutputContent }
    | { type: "FLASHCARDS"; data: FlashcardsOutputContent }
    | { type: "QUIZ"; data: QuizOutputContent }
    | { type: "MINDMAP"; data: MindmapOutputContent }
    | { type: "REPORT"; data: ReportOutputContent }
    | { type: "STUDY_GUIDE"; data: StudyGuideOutputContent }
    | { type: "FAQ"; data: FaqOutputContent }
    | { type: "TIMELINE"; data: TimelineOutputContent }
    | { type: "BRIEFING"; data: BriefingOutputContent }
    | { type: "AUDIO_OVERVIEW"; data: AudioOverviewOutputContent }
    | { type: "SLIDES"; data: SlidesOutputContent }
    | { type: "DATA_TABLE"; data: DataTableOutputContent }
    | { type: "VIDEO_EXPLAINER"; data: VideoExplainerOutputContent };

/**
 * Validates stored or freshly generated output content against the schema for
 * its type.
 *
 * @param type - Output type the content was generated for
 * @param value - Raw content JSON
 * @returns Tagged content when valid, otherwise `null`
 */
export function parseOutputContent(
    type: OutputType,
    value: JsonReadValue | undefined,
): OutputContent | null {
    if (value === null || value === undefined) {
        return null;
    }

    switch (type) {
        case "SUMMARY": {
            const parsed = summaryOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "TAKEAWAYS": {
            const parsed = takeawaysOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "FLASHCARDS": {
            const parsed = flashcardsOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "QUIZ": {
            const parsed = quizOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "MINDMAP": {
            const parsed = mindmapOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "REPORT": {
            const parsed = reportOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "STUDY_GUIDE": {
            const parsed = studyGuideOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "FAQ": {
            const parsed = faqOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "TIMELINE": {
            const parsed = timelineOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "BRIEFING": {
            const parsed = briefingOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "AUDIO_OVERVIEW": {
            const parsed = audioOverviewOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "SLIDES": {
            const parsed = slidesOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "DATA_TABLE": {
            const parsed = dataTableOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
        case "VIDEO_EXPLAINER": {
            const parsed = videoExplainerOutputContentSchema.safeParse(value);
            return parsed.success ? { type, data: parsed.data } : null;
        }
    }
}

/* -------------------------------------------------------------------------- */
/*                              Notebook notes                                */
/* -------------------------------------------------------------------------- */

export const NOTE_TITLE_MAX_LENGTH = 120;
export const NOTE_CONTENT_MAX_LENGTH = 20_000;
export const NOTE_EXCERPT_MAX_LENGTH = 2_000;
export const NOTE_CITATIONS_MAX = 25;
export const NOTE_CITATIONS_VERSION = 1;

/**
 * Whether notes are indexed and retrieved as grounding material.
 *
 * Deliberately `false`. A note is the reader's own writing, so indexing it would
 * let a model cite the reader's paraphrase back to them as if it were evidence,
 * and would change what "grounded in your sources" means without them asking.
 * Notes therefore carry citations *to* sources and never become one. Flipping
 * this requires a distinct user-authored source class, its own processing
 * version, and an explicit reader opt-in — not a change to this constant alone.
 */
export const NOTES_PARTICIPATE_IN_GROUNDING = false;

/** Where a note came from, which decides how its citations were captured. */
export const noteOriginSchema = z.enum(["MANUAL", "CHAT", "OUTPUT"]);

export type NoteOrigin = z.infer<typeof noteOriginSchema>;

/**
 * A citation as submitted by a client: which source, which location, and the
 * text being quoted.
 *
 * The source's type and title are deliberately absent. They are read from the
 * source record when the note is saved, so a client can never assert facts about
 * a source — only point at one it already has access to.
 */
export const noteCitationInputSchema = z.object({
    sourceId: z.string().min(1),
    excerpt: z.string().max(NOTE_EXCERPT_MAX_LENGTH),
    page: z.number().int().positive().optional(),
    chunkId: z.string().min(1).optional(),
    chunkIndex: z.number().int().nonnegative().optional(),
    timestamp: z.number().finite().nonnegative().optional(),
});

/**
 * A note's persisted pointer back into a source location.
 *
 * Deliberately narrower than {@link citationSchema}: a note cites places in the
 * reader's own notebook, so there is no display label to keep stable and no web
 * result to attribute. Location fields mirror the chat contract so the same
 * in-place source viewer opens both.
 */
export const noteCitationSchema = noteCitationInputSchema.extend({
    sourceType: sourceTypeSchema,
    title: z.string().min(1),
});

export const noteCitationEnvelopeSchema = z.object({
    version: z.literal(NOTE_CITATIONS_VERSION),
    items: z
        .array(noteCitationSchema)
        .max(NOTE_CITATIONS_MAX)
        .refine(
            (items) =>
                new Set(
                    items.map(
                        (item) =>
                            `${item.sourceId}:${item.chunkId ?? item.chunkIndex ?? ""}:${item.excerpt}`,
                    ),
                ).size === items.length,
            "Note citations must be unique",
        ),
});

/** The chat answer or Studio output an excerpt was saved from. */
export const noteSavedFromSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("chat"),
        conversationId: z.string().min(1),
        messageId: z.string().min(1),
    }),
    z.object({
        kind: z.literal("output"),
        outputId: z.string().min(1),
    }),
]);

const noteTitleSchema = z.string().trim().min(1).max(NOTE_TITLE_MAX_LENGTH);
const noteContentSchema = z
    .string()
    .trim()
    .min(1, "A note needs some text")
    .max(NOTE_CONTENT_MAX_LENGTH);

export const createNoteRequestSchema = z.object({
    title: noteTitleSchema.optional(),
    content: noteContentSchema,
    origin: noteOriginSchema.default("MANUAL"),
    citations: z
        .array(noteCitationInputSchema)
        .max(NOTE_CITATIONS_MAX)
        .optional(),
    savedFrom: noteSavedFromSchema.optional(),
});

export const updateNoteRequestSchema = z
    .object({
        title: noteTitleSchema.optional(),
        content: noteContentSchema.optional(),
        citations: z
            .array(noteCitationInputSchema)
            .max(NOTE_CITATIONS_MAX)
            .optional(),
    })
    .refine(
        (input) =>
            input.title !== undefined ||
            input.content !== undefined ||
            input.citations !== undefined,
        "Provide at least one field to update",
    );

export const noteSchema = z.object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    title: z.string().min(1),
    content: z.string(),
    origin: noteOriginSchema,
    /** Sources this note cites, derived from its citations by the server. */
    sourceIds: z.array(z.string().min(1)),
    citations: noteCitationEnvelopeSchema.nullable(),
    savedFrom: noteSavedFromSchema.nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
});

export type NoteCitationInput = z.infer<typeof noteCitationInputSchema>;
export type NoteCitation = z.infer<typeof noteCitationSchema>;
export type NoteCitationEnvelope = z.infer<typeof noteCitationEnvelopeSchema>;
export type NoteSavedFrom = z.infer<typeof noteSavedFromSchema>;
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;
/** Create payload as sent by a client, before `origin` is defaulted. */
export type CreateNoteRequestInput = z.input<typeof createNoteRequestSchema>;
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;
export type Note = z.infer<typeof noteSchema>;

/**
 * Reads a note's persisted citations, tolerating rows that have none.
 *
 * @param value - Raw `citations` JSON column value
 * @returns The citations, or an empty list when the column holds nothing usable
 */
export function readNoteCitations(
    value: JsonReadValue | undefined,
): NoteCitation[] {
    if (value === null || value === undefined) {
        return [];
    }
    const parsed = noteCitationEnvelopeSchema.safeParse(value);
    return parsed.success ? parsed.data.items : [];
}

/**
 * Reads a note's saved-from origin.
 *
 * @param value - Raw `savedFrom` JSON column value
 * @returns The origin pointer, or `null` when the note was written by hand
 */
export function readNoteSavedFrom(
    value: JsonReadValue | undefined,
): NoteSavedFrom | null {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = noteSavedFromSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
