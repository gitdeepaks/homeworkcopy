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
});
