/**
 * OpenAI speech-to-text adapter.
 *
 * Requires `OPENAI_API_KEY`. The model can be pinned with `STT_MODEL`, but it
 * must be one that returns segment timestamps: a transcript without them can
 * still be searched, yet its citations could not point a reader at the moment in
 * the recording that supports an answer.
 */

import OpenAI from "openai";
import { SOURCE_AUDIO_UPLOAD_MAX_BYTES } from "@homeworkcopy/contracts";
import { z } from "zod";
import { withTimeout } from "../timeout.js";
import type {
    SpeechToTextProvider,
    TranscriptionRequest,
    TranscriptionResult,
} from "./types.js";

const DEFAULT_MODEL = "whisper-1";

const TRANSCRIPTION_TIMEOUT_MS = 300_000;

/**
 * Shape of a `verbose_json` transcription. Only the fields the pipeline needs
 * are declared; anything else the vendor adds is ignored.
 */
const transcriptionResponseSchema = z.object({
    text: z.string(),
    language: z.string().min(1).optional(),
    /** Seconds. */
    duration: z.number().nonnegative().optional(),
    segments: z
        .array(
            z.object({
                start: z.number().nonnegative(),
                end: z.number().nonnegative(),
                text: z.string(),
            }),
        )
        .optional(),
});

let client: OpenAI | null = null;

function getClient(apiKey: string): OpenAI {
    if (!client) {
        client = new OpenAI({ apiKey });
    }
    return client;
}

/**
 * Builds the OpenAI adapter when the environment is configured for it.
 *
 * @returns A provider, or `null` when no API key is available
 */
export function createOpenAiTranscriptionProvider(): SpeechToTextProvider | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return null;
    }

    const model = process.env.STT_MODEL ?? DEFAULT_MODEL;

    return {
        id: "openai",
        model,
        maxInputBytes: SOURCE_AUDIO_UPLOAD_MAX_BYTES,
        async transcribe(
            request: TranscriptionRequest,
        ): Promise<TranscriptionResult> {
            const file = new File([request.audio], request.fileName, {
                type: request.mimeType,
            });

            const response = await withTimeout(
                "Audio transcription",
                TRANSCRIPTION_TIMEOUT_MS,
                getClient(apiKey).audio.transcriptions.create({
                    file,
                    model,
                    response_format: "verbose_json",
                    timestamp_granularities: ["segment"],
                    ...(request.language
                        ? { language: request.language }
                        : {}),
                }),
            );

            const parsed = transcriptionResponseSchema.safeParse(response);
            if (!parsed.success) {
                throw new Error(
                    "The transcription provider returned an unusable response",
                );
            }

            const segments = (parsed.data.segments ?? []).flatMap((segment) => {
                const text = segment.text.trim();
                return text
                    ? [
                          {
                              text,
                              offset: segment.start,
                              duration: Math.max(
                                  0,
                                  segment.end - segment.start,
                              ),
                          },
                      ]
                    : [];
            });

            return {
                text: parsed.data.text.trim(),
                segments,
                durationMs:
                    parsed.data.duration === undefined
                        ? null
                        : Math.round(parsed.data.duration * 1_000),
                language: parsed.data.language ?? null,
            };
        },
    };
}
