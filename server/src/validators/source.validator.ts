import {
    createSourceInputSchema,
    importWebsiteInputSchema,
    importYoutubeInputSchema,
    SOURCE_BATCH_MAX_ITEMS,
    SOURCE_CONTENT_MAX_LENGTH,
    SOURCE_TITLE_MAX_LENGTH,
    sourceIdempotencyKeySchema,
    sourceStatusSchema,
    sourceTypeSchema,
} from "@homeworkcopy/contracts";
import { z } from "zod";

export const workspaceIdParamSchema = z.object({
    workspaceId: z.string().trim().min(1),
});

export const sourceIdParamSchema = z.object({
    workspaceId: z.string().trim().min(1),
    sourceId: z.string().trim().min(1),
});

export const listSourcesQuerySchema = z.object({
    q: z.string().trim().optional(),
    type: sourceTypeSchema.optional(),
    status: sourceStatusSchema.optional(),
});

export const createSourceSchema = createSourceInputSchema;
export const importWebsiteSchema = importWebsiteInputSchema;
export const importYoutubeSchema = importYoutubeInputSchema;

/** Multipart fields accepted alongside a PDF or audio upload. */
export const uploadFileFieldsSchema = z.object({
    title: z.string().trim().min(1).max(SOURCE_TITLE_MAX_LENGTH).optional(),
});

export const idempotencyKeyHeaderSchema = z.object({
    "idempotency-key": sourceIdempotencyKeySchema.optional(),
});

export const bulkDeleteSourcesSchema = z.object({
    sourceIds: z.array(z.string().trim().min(1)).min(1).max(SOURCE_BATCH_MAX_ITEMS),
});

export const reprocessSourcesSchema = z.object({
    sourceIds: z.array(z.string().trim().min(1)).max(SOURCE_BATCH_MAX_ITEMS).optional(),
});

export const importWebSearchSchema = z.object({
    title: z.string().trim().min(1).max(SOURCE_TITLE_MAX_LENGTH),
    content: z.string().trim().min(1).max(SOURCE_CONTENT_MAX_LENGTH),
    url: z.url({ protocol: /^https?$/ }),
});

export type CreateSourceInput = z.infer<typeof createSourceSchema>;
export type ListSourcesQuery = z.infer<typeof listSourcesQuerySchema>;
export type ImportWebsiteInput = z.infer<typeof importWebsiteSchema>;
export type ImportYoutubeInput = z.infer<typeof importYoutubeSchema>;
export type BulkDeleteSourcesInput = z.infer<typeof bulkDeleteSourcesSchema>;
export type ReprocessSourcesInput = z.infer<typeof reprocessSourcesSchema>;
export type ImportWebSearchInput = z.infer<typeof importWebSearchSchema>;
