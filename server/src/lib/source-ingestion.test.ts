import { describe, expect, test } from "bun:test";
import { Readable } from "node:stream";
import {
    canonicalizeSourceUrl,
    checksumContent,
    enforceExtractedContentLimits,
    enforceNotebookIngestionLimits,
    sourceChunkId,
    verifyPdfUpload,
} from "./source-ingestion.js";

function pdfFile(buffer: Buffer): Express.Multer.File {
    return {
        fieldname: "file",
        originalname: "notes.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        size: buffer.byteLength,
        stream: Readable.from(buffer),
        destination: "",
        filename: "notes.pdf",
        path: "",
        buffer,
    };
}

describe("source ingestion reliability", () => {
    test("normalizes content and tracking URLs for duplicate detection", () => {
        expect(checksumContent("line one\r\nline two"))
            .toBe(checksumContent("line one\nline two"));
        expect(canonicalizeSourceUrl("https://EXAMPLE.com/page?utm_source=test&id=2#part"))
            .toBe("https://example.com/page?id=2");
    });

    test("uses deterministic chunk ids within a processing version", () => {
        const first = sourceChunkId("source-1", 3, 0, "content");
        expect(sourceChunkId("source-1", 3, 0, "content")).toBe(first);
        expect(sourceChunkId("source-1", 4, 0, "content")).not.toBe(first);
    });

    test("checks PDF signatures instead of trusting MIME alone", () => {
        expect(() => verifyPdfUpload(pdfFile(Buffer.from("%PDF-1.7")))).not.toThrow();
        expect(() => verifyPdfUpload(pdfFile(Buffer.from("not a pdf")))).toThrow("not a valid PDF");
    });

    test("enforces source, concurrency, and extraction limits", () => {
        expect(() => enforceNotebookIngestionLimits(100, 0)).toThrow("100-source limit");
        expect(() => enforceNotebookIngestionLimits(2, 5)).toThrow("active imports");
        expect(() => enforceExtractedContentLimits("x", 25_001)).toThrow("too many caption segments");
    });
});
