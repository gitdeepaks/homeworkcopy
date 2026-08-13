import { describe, expect, test } from "bun:test";
import { parseCitations } from "./api";

describe("parseCitations", () => {
    test("loads persisted legacy web citations", () => {
        const citations = parseCitations([{
            sourceType: "WEB",
            sourceTitle: "Article",
            url: "https://example.com/article",
            excerpt: "Evidence",
        }]);

        expect(citations).toEqual([{
            kind: "web",
            label: "W1",
            title: "Article",
            url: "https://example.com/article",
            excerpt: "Evidence",
            provenance: { provider: "tavily", query: "legacy conversation" },
        }]);
    });

    test("rejects malformed citation JSON", () => {
        expect(parseCitations([{ sourceType: "WEB", url: "javascript:alert(1)" }])).toBeNull();
    });
});
