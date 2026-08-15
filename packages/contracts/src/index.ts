import { z } from "zod";

export const sourceTypeSchema = z.enum([
    "PDF",
    "WEBSITE",
    "YOUTUBE",
    "TEXT",
    "MARKDOWN",
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

export const storedSourceMetadataSchema = sourceMetadataCommonSchema.extend({
    fileUrl: z.url({ protocol: /^https?$/ }).optional(),
    fileName: z.string().min(1).optional(),
    fileSize: z.number().int().nonnegative().optional(),
    publicId: z.string().min(1).optional(),
    resourceType: z.enum(["raw", "image"]).optional(),
    pageCount: z.number().int().positive().optional(),
    safetyCheck: z.literal("pdf-signature-verified").optional(),
    importedFrom: z.string().min(1).optional(),
    sourceUrl: z.url({ protocol: /^https?$/ }).optional(),
    videoId: z.string().regex(/^[\w-]{11}$/).optional(),
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
]);

export const outputStatusSchema = z.enum([
    "PENDING",
    "PROCESSING",
    "READY",
    "FAILED",
    "CANCELLED",
]);

export const outputGroupSchema = z.enum([
    "featured-media",
    "study",
    "writing",
    "saved",
]);

export type OutputType = z.infer<typeof outputTypeSchema>;
export type OutputStatus = z.infer<typeof outputStatusSchema>;
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
};

export const OUTPUT_TYPES: readonly OutputType[] = outputTypeSchema.options;

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

/** Client-supplied generation options; defaults are applied on parse. */
export const outputGenerationOptionsInputSchema = z.object({
    length: outputLengthSchema.default("standard"),
    locale: outputLocaleSchema.default("en"),
    focus: outputFocusSchema.optional(),
});

/** Persisted, versioned generation options snapshot. */
export const outputGenerationOptionsSchema = z.object({
    version: z.literal(1),
    length: outputLengthSchema,
    locale: outputLocaleSchema,
    focus: outputFocusSchema.optional(),
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
]);

export const outputFailureCodeSchema = z.enum([
    "SOURCES_UNAVAILABLE",
    "NO_SOURCE_CONTENT",
    "GENERATION_FAILED",
    "INVALID_MODEL_OUTPUT",
    "UNSUPPORTED_OUTPUT_TYPE",
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

export const outputMetadataSchema = z.object({
    version: z.literal(OUTPUT_METADATA_VERSION),
    generatedAt: z.iso.datetime().optional(),
    provider: z.literal("openai").optional(),
    model: z.string().min(1).optional(),
    options: outputGenerationOptionsSchema.optional(),
    sourceSnapshot: outputSourceSnapshotSchema.optional(),
    sourceLabels: z.array(outputSourceLabelSchema).optional(),
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
    | { type: "BRIEFING"; data: BriefingOutputContent };

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
    }
}
