import { describe, expect, test } from "bun:test";
import {
    validatePastedSource,
    validatePdfFiles,
    validateWebsiteSource,
    validateYoutubeSource,
} from "./source-validation";

describe("source picker validation", () => {
    test("validates all selected files before queueing a batch", () => {
        expect(validatePdfFiles([
            { name: "first.pdf", type: "application/pdf", size: 1_024 },
            { name: "second.txt", type: "text/plain", size: 1_024 },
        ])).toBe("second.txt is not a PDF file.");
        expect(validatePdfFiles([
            { name: "large.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 },
        ])).toBe("large.pdf is larger than 10 MB.");
    });

    test("matches server-side URL and content contracts", () => {
        expect(validateWebsiteSource({ url: "javascript:alert(1)" })).not.toBeNull();
        expect(validateYoutubeSource({ url: "https://example.com/watch?v=dQw4w9WgXcQ" })).not.toBeNull();
        expect(validatePastedSource({ type: "TEXT", title: "", content: "notes" })).toBe("Title is required");
        expect(validatePastedSource({ type: "MARKDOWN", title: "Notes", content: "# Ready" })).toBeNull();
    });
});
