/**
 * OpenAI text-to-speech adapter.
 *
 * Requires `OPENAI_API_KEY`. The model can be pinned with `TTS_MODEL`.
 */

import OpenAI from "openai";
import type { AudioSpeaker, AudioVoiceProfile } from "@homeworkcopy/contracts";
import { withTimeout } from "../timeout.js";
import type {
    SpeechRequest,
    SynthesizedSpeech,
    TextToSpeechProvider,
} from "./types.js";

const DEFAULT_MODEL = "gpt-4o-mini-tts";

/** OpenAI's documented per-request input limit. */
const MAX_INPUT_LENGTH = 4_096;

const SYNTHESIS_TIMEOUT_MS = 60_000;

/**
 * Voice pairs per profile. The second entry is used by the `guest` speaker so a
 * dialogue is audibly two people rather than one voice reading both parts.
 */
const VOICES: Record<AudioVoiceProfile, Record<AudioSpeaker, string>> = {
    neutral: { host: "alloy", guest: "echo" },
    warm: { host: "sage", guest: "coral" },
    bright: { host: "shimmer", guest: "verse" },
};

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
export function createOpenAiTtsProvider(): TextToSpeechProvider | null {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return null;
    }

    const model = process.env.TTS_MODEL ?? DEFAULT_MODEL;

    return {
        id: "openai",
        model,
        maxInputLength: MAX_INPUT_LENGTH,
        async synthesize(request: SpeechRequest): Promise<SynthesizedSpeech> {
            const voiceId = VOICES[request.voiceProfile][request.speaker];
            const response = await withTimeout(
                "Speech synthesis",
                SYNTHESIS_TIMEOUT_MS,
                getClient(apiKey).audio.speech.create({
                    model,
                    voice: voiceId,
                    input: request.text,
                    response_format: "mp3",
                    instructions: `${request.direction} Speak in the language identified by the BCP-47 code "${request.language}".`,
                }),
            );

            return {
                audio: new Uint8Array(await response.arrayBuffer()),
                format: "mp3",
                voiceId,
            };
        },
    };
}
