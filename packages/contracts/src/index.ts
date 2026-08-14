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

export const sourceCitationSchema = citationBaseSchema.extend({
    kind: z.literal("source"),
    sourceId: z.string().min(1),
    sourceType: sourceTypeSchema,
    provenance: z.object({
        provider: z.enum(["pinecone", "postgres", "hybrid"]),
        score: z.number().finite().optional(),
    }),
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
    items: z.array(citationSchema),
});

export type Citation = z.infer<typeof citationSchema>;
export type SourceCitation = z.infer<typeof sourceCitationSchema>;
export type WebCitation = z.infer<typeof webCitationSchema>;
export type CitationEnvelope = z.infer<typeof citationEnvelopeSchema>;

export const apiErrorResponseSchema = z.object({
    error: z.object({
        code: z.string().min(1),
        message: z.string().min(1),
        requestId: z.string().min(1),
        details: z.unknown().optional(),
    }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
