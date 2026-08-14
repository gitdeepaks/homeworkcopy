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
]);

export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const SOURCE_SELECTION_MAX = 50;
export const RETRIEVAL_VERSION = "hybrid-v1";

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
    chunkCount: z.number().int().nonnegative().optional(),
    indexedAt: z.iso.datetime().optional(),
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
