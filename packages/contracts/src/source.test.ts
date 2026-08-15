import { describe, expect, test } from "bun:test";
import {
    createSourceInputSchema,
    importWebsiteInputSchema,
    importYoutubeInputSchema,
    SOURCE_CONTENT_MAX_LENGTH,
    sourceChunksResponseSchema,
} from "./index";

describe("sourceChunksResponseSchema", () => {
    test("parses typed PDF and chunk location metadata", () => {
        const response = sourceChunksResponseSchema.parse({
            source: {
                id: "source-1",
                workspaceId: "notebook-1",
                type: "PDF",
                title: "Research paper",
                content: "Extracted text",
                url: null,
                status: "READY",
                processingStage: "READY",
                processingVersion: 1,
                contentChecksum: null,
                metadata: {
                    fileUrl: "https://cdn.example.com/paper.pdf",
                    pageCount: 12,
                },
                createdAt: "2026-08-15T10:00:00.000Z",
                updatedAt: "2026-08-15T10:00:00.000Z",
            },
            chunks: [{
                id: "chunk-1",
                sourceId: "source-1",
                index: 0,
                content: "Exact evidence",
                tokenCount: 3,
                metadata: { page: 4 },
                processingVersion: 1,
                createdAt: "2026-08-15T10:00:00.000Z",
            }],
            count: 1,
        });

        expect(response.source.type).toBe("PDF");
        expect(response.chunks[0]?.metadata?.page).toBe(4);
    });

    test("safely strips unsupported legacy metadata fields", () => {
        const response = sourceChunksResponseSchema.parse({
            source: {
                id: "source-1",
                workspaceId: "notebook-1",
                type: "TEXT",
                title: "Notes",
                content: "Text",
                url: null,
                status: "READY",
                processingStage: "READY",
                processingVersion: 1,
                contentChecksum: null,
                metadata: { legacyField: "ignored", chunkCount: 1 },
                createdAt: "2026-08-15T10:00:00.000Z",
                updatedAt: "2026-08-15T10:00:00.000Z",
            },
            chunks: [],
            count: 0,
        });

        expect(response.source.metadata).toEqual({ chunkCount: 1 });
    });
});

describe("source ingestion request contracts", () => {
    test("accepts supported source inputs and HTTP URLs", () => {
        expect(createSourceInputSchema.parse({
            type: "MARKDOWN",
            title: "Study notes",
            content: "# Chapter one",
        }).type).toBe("MARKDOWN");
        expect(importWebsiteInputSchema.parse({ url: "https://example.com/article" }).url)
            .toBe("https://example.com/article");
        expect(importYoutubeInputSchema.parse({ url: "https://youtu.be/dQw4w9WgXcQ" }).url)
            .toBe("https://youtu.be/dQw4w9WgXcQ");
    });

    test("rejects unsafe protocols, invalid videos, and oversized content", () => {
        expect(importWebsiteInputSchema.safeParse({ url: "file:///etc/passwd" }).success).toBe(false);
        expect(importYoutubeInputSchema.safeParse({ url: "https://example.com/video" }).success).toBe(false);
        expect(createSourceInputSchema.safeParse({
            type: "TEXT",
            title: "Large",
            content: "x".repeat(SOURCE_CONTENT_MAX_LENGTH + 1),
        }).success).toBe(false);
    });
});
