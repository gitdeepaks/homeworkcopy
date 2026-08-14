import { describe, expect, test } from "bun:test";
import { citationEnvelopeSchema, type CitationEnvelope } from "./index";

describe("citationEnvelopeSchema", () => {
    test("round-trips source and web citations", () => {
        const value: CitationEnvelope = {
            version: 1,
            items: [
                {
                    kind: "source",
                    label: "1",
                    sourceId: "source-1",
                    sourceType: "PDF",
                    title: "Notes",
                    excerpt: "Evidence",
                    page: 2,
                    provenance: { provider: "pinecone", score: 0.91 },
                },
                {
                    kind: "web",
                    label: "W1",
                    url: "https://example.com/article",
                    title: "Article",
                    excerpt: "Web evidence",
                    provenance: { provider: "tavily", query: "example" },
                },
            ],
        };

        expect(citationEnvelopeSchema.parse(value)).toEqual(value);
    });

    test("rejects unsafe web URLs", () => {
        const result = citationEnvelopeSchema.safeParse({
            version: 1,
            items: [{
                kind: "web",
                label: "W1",
                url: "javascript:alert(1)",
                title: "Unsafe",
                excerpt: "",
                provenance: { provider: "tavily", query: "unsafe" },
            }],
        });

        expect(result.success).toBe(false);
    });

    test("preserves unavailable source citations", () => {
        const result = citationEnvelopeSchema.parse({
            version: 1,
            items: [{
                kind: "source",
                label: "1",
                sourceId: "deleted-source",
                sourceType: "TEXT",
                title: "Deleted notes",
                excerpt: "Saved evidence",
                chunkId: "deleted-chunk",
                chunkIndex: 0,
                availability: "source-unavailable",
                provenance: { provider: "postgres" },
            }],
        });

        expect(result.items[0]?.kind).toBe("source");
        if (result.items[0]?.kind === "source") {
            expect(result.items[0].availability).toBe("source-unavailable");
        }
    });

    test("rejects duplicate display labels", () => {
        const citation = {
            kind: "source",
            label: "1",
            sourceId: "source-1",
            sourceType: "TEXT",
            title: "Notes",
            excerpt: "Evidence",
            chunkId: "chunk-1",
            chunkIndex: 0,
            provenance: { provider: "postgres" },
        };
        const result = citationEnvelopeSchema.safeParse({
            version: 1,
            items: [citation, citation],
        });

        expect(result.success).toBe(false);
    });
});
