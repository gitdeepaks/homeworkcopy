import type { TranscriptSegment } from "@homeworkcopy/contracts";

/** One transcription request for a complete audio file. */
export type TranscriptionRequest = {
    /** Complete file bytes. An `ArrayBuffer` so it can be handed to a `File`. */
    audio: ArrayBuffer;
    /** Original file name, which some vendors use to infer the container. */
    fileName: string;
    mimeType: string;
    /**
     * BCP-47 hint for the spoken language. Omitted when unknown, in which case
     * the provider detects it.
     */
    language?: string | undefined;
};

export type TranscriptionResult = {
    /** Full transcript text. */
    text: string;
    /**
     * Timestamped segments in playback order, with `offset` and `duration` in
     * seconds — the same units the YouTube transcript path uses, so both feed
     * the same chunking and citation code.
     */
    segments: TranscriptSegment[];
    /** Total duration the provider reported, or `null` when it reported none. */
    durationMs: number | null;
    /** Language the provider detected, or `null` when it reported none. */
    language: string | null;
};

/**
 * A speech-to-text vendor.
 *
 * Audio source ingestion depends only on this interface, so swapping vendors
 * never reaches the persisted source metadata, the chunking pipeline, or the
 * timestamped citations built from it.
 */
export type SpeechToTextProvider = {
    /** Stable id persisted on the source, e.g. `openai`. */
    readonly id: string;
    /** Vendor model id persisted alongside the transcript. */
    readonly model: string;
    /** Largest file this provider accepts in one request. */
    readonly maxInputBytes: number;
    transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
};
