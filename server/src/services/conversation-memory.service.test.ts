import { describe, expect, test } from "bun:test";
import { buildBoundedSummaryTranscript } from "./conversation-memory.service.js";

describe("bounded conversation summaries", () => {
    test("counts only messages included in the summary transcript", () => {
        const result = buildBoundedSummaryTranscript([
            { role: "USER", content: "x".repeat(30_000) },
            { role: "ASSISTANT", content: "must remain unsummarized" },
        ]);
        expect(result.includedCount).toBe(1);
        expect(result.transcript).not.toContain("must remain unsummarized");
        expect(result.transcript.length).toBeLessThanOrEqual(24_000);
    });
});
