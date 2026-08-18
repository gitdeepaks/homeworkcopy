import { describe, expect, test } from "bun:test";
import { Readable } from "node:stream";
import {
    canonicalizeSourceUrl,
    checksumContent,
    enforceExtractedContentLimits,
    enforceNotebookIngestionLimits,
    getSafeProcessingFailure,
    sourceChunkId,
    verifyAudioUpload,
    verifyPdfUpload,
} from "./source-ingestion.js";
import { SOURCE_AUDIO_UPLOAD_MAX_BYTES } from "@homeworkcopy/contracts";
import {
    AppError,
    ConflictError,
    SourceExtractionError,
    ValidationError,
} from "../types/app-error.js";

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

function audioFile(
    buffer: Buffer,
    mimetype = "audio/mpeg",
    originalname = "lecture.mp3",
): Express.Multer.File {
    return {
        fieldname: "file",
        originalname,
        encoding: "7bit",
        mimetype,
        size: buffer.byteLength,
        stream: Readable.from(buffer),
        destination: "",
        filename: originalname,
        path: "",
        buffer,
    };
}

/** Minimal container headers, enough for the signature check. */
const AUDIO_HEADERS = {
    id3Mp3: Buffer.from("ID3\u0003\u0000\u0000\u0000", "binary"),
    frameMp3: Buffer.from([0xff, 0xfb, 0x90, 0x00]),
    wav: Buffer.concat([
        Buffer.from("RIFF"),
        Buffer.alloc(4),
        Buffer.from("WAVE"),
    ]),
    m4a: Buffer.concat([Buffer.alloc(4), Buffer.from("ftypM4A ")]),
    ogg: Buffer.from("OggS\u0000\u0002", "binary"),
    flac: Buffer.from("fLaC\u0000\u0000", "binary"),
    webm: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]),
};

describe("audio source uploads", () => {
    test("resolves the container format from the file's own bytes", () => {
        expect(verifyAudioUpload(audioFile(AUDIO_HEADERS.id3Mp3)).format).toBe("mp3");
        expect(verifyAudioUpload(audioFile(AUDIO_HEADERS.frameMp3)).format).toBe("mp3");
        expect(
            verifyAudioUpload(audioFile(AUDIO_HEADERS.wav, "audio/wav", "talk.wav"))
                .format,
        ).toBe("wav");
        expect(
            verifyAudioUpload(audioFile(AUDIO_HEADERS.m4a, "audio/mp4", "talk.m4a"))
                .format,
        ).toBe("m4a");
        expect(
            verifyAudioUpload(audioFile(AUDIO_HEADERS.ogg, "audio/ogg", "talk.ogg"))
                .format,
        ).toBe("ogg");
        expect(
            verifyAudioUpload(audioFile(AUDIO_HEADERS.flac, "audio/flac", "talk.flac"))
                .format,
        ).toBe("flac");
        expect(
            verifyAudioUpload(audioFile(AUDIO_HEADERS.webm, "audio/webm", "talk.webm"))
                .format,
        ).toBe("webm");
    });

    test("rejects a non-audio file wearing an audio MIME type", () => {
        expect(() => verifyAudioUpload(audioFile(Buffer.from("%PDF-1.7")))).toThrow(
            "not a readable audio recording",
        );
    });

    test("rejects a container the transcription provider cannot read", () => {
        expect(() =>
            verifyAudioUpload(
                audioFile(AUDIO_HEADERS.id3Mp3, "audio/aiff", "talk.aiff"),
            ),
        ).toThrow("Upload an MP3");
    });

    test("rejects a file beyond the upload ceiling", () => {
        const file = audioFile(AUDIO_HEADERS.id3Mp3);
        file.size = SOURCE_AUDIO_UPLOAD_MAX_BYTES + 1;
        expect(() => verifyAudioUpload(file)).toThrow("25 MB or smaller");
    });
});

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

describe("getSafeProcessingFailure", () => {
    /**
     * Rebuilds an error the way Inngest does when a step failure crosses back
     * into the function handler: a fresh `Error` carrying only `name`,
     * `message`, `stack`, `cause`, and `code`. Anything else the original
     * instance held is gone, which is exactly what this classifier has to cope
     * with.
     */
    function asRehydrated(error: AppError): Error {
        const rebuilt = new Error(error.message);
        rebuilt.name = error.name;
        Object.defineProperty(rebuilt, "code", {
            value: error.code,
            enumerable: true,
        });
        return rebuilt;
    }

    test("keeps a classified failure's own code and message", () => {
        const failure = getSafeProcessingFailure(
            new SourceExtractionError(
                "NO_EXTRACTABLE_CONTENT",
                "This video has no captions, so there is no transcript to import.",
            ),
        );

        expect(failure.code).toBe("NO_EXTRACTABLE_CONTENT");
        expect(failure.message).toContain("no captions");
    });

    test("still classifies after the error crosses an Inngest step boundary", () => {
        const original = new SourceExtractionError(
            "NO_EXTRACTABLE_CONTENT",
            "This video has no captions, so there is no transcript to import.",
        );
        const failure = getSafeProcessingFailure(asRehydrated(original));

        expect(failure.code).toBe("NO_EXTRACTABLE_CONTENT");
        expect(failure.message).toBe(original.message);
    });

    test("separates a rate-limited attempt from a video that has no captions", () => {
        const blocked = getSafeProcessingFailure(
            asRehydrated(
                new SourceExtractionError(
                    "EXTRACTION_FAILED",
                    "YouTube is rate-limiting transcript requests from this server. Retry the import in a few minutes.",
                ),
            ),
        );
        const permanent = getSafeProcessingFailure(
            asRehydrated(
                new SourceExtractionError(
                    "NO_EXTRACTABLE_CONTENT",
                    "This video has no captions, so there is no transcript to import.",
                ),
            ),
        );

        expect(blocked.code).toBe("EXTRACTION_FAILED");
        expect(blocked.message).toContain("Retry");
        expect(permanent.code).toBe("NO_EXTRACTABLE_CONTENT");
        expect(permanent.message).not.toContain("Retry");
    });

    test("reads a validation failure by name, not only by instance", () => {
        const failure = getSafeProcessingFailure(
            asRehydrated(new ValidationError("Enter a valid YouTube URL")),
        );

        expect(failure.code).toBe("EXTRACTION_FAILED");
        expect(failure.message).toBe("Enter a valid YouTube URL");
    });

    test("does not mistake an unrelated error code for a failure code", () => {
        const failure = getSafeProcessingFailure(
            asRehydrated(new ConflictError("This PDF already exists")),
        );

        expect(failure.code).toBe("EXTRACTION_FAILED");
        expect(failure.message).toBe("Source extraction failed. Retry the import.");
    });

    test("falls back to a safe message for an unrecognized provider error", () => {
        const failure = getSafeProcessingFailure(
            new Error("openai responded 500: {\"key\":\"sk-live-secret\"}"),
        );

        expect(failure.code).toBe("EXTRACTION_FAILED");
        expect(failure.message).toBe("Source extraction failed. Retry the import.");
        expect(failure.message).not.toContain("sk-live-secret");
    });
});
