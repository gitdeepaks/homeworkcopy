import { describe, expect, test } from "bun:test";
import { Readable } from "node:stream";
import {
    canonicalizeSourceUrl,
    checksumContent,
    enforceExtractedContentLimits,
    enforceNotebookIngestionLimits,
    sourceChunkId,
    verifyAudioUpload,
    verifyPdfUpload,
} from "./source-ingestion.js";
import { SOURCE_AUDIO_UPLOAD_MAX_BYTES } from "@homeworkcopy/contracts";

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
