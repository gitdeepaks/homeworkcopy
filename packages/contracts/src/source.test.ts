import { describe, expect, test } from "bun:test";
import { sourceChunksResponseSchema } from "./index";

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
