/**
 * Text-to-speech provider selection.
 *
 * `TTS_PROVIDER` chooses the adapter; adding a vendor means adding a factory
 * here and nothing else.
 */

import { createOpenAiTtsProvider } from "./openai-tts.js";
import type { TextToSpeechProvider } from "./types.js";

const PROVIDER_FACTORIES: Record<string, () => TextToSpeechProvider | null> = {
    openai: createOpenAiTtsProvider,
};

const DEFAULT_PROVIDER_ID = "openai";

/**
 * Resolves the configured provider.
 *
 * @returns The provider, or `null` when the deployment cannot synthesize audio
 */
export function getTextToSpeechProvider(): TextToSpeechProvider | null {
    const id = process.env.TTS_PROVIDER ?? DEFAULT_PROVIDER_ID;
    const factory = PROVIDER_FACTORIES[id];
    return factory ? factory() : null;
}

export type {
    SpeechRequest,
    SynthesizedSpeech,
    TextToSpeechProvider,
} from "./types.js";
