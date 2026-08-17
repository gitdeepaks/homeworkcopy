/**
 * Speech-to-text provider selection.
 *
 * `STT_PROVIDER` chooses the adapter; adding a vendor means adding a factory
 * here and nothing else.
 */

import { createOpenAiTranscriptionProvider } from "./openai-whisper.js";
import type { SpeechToTextProvider } from "./types.js";

const PROVIDER_FACTORIES: Record<
    string,
    () => SpeechToTextProvider | null
> = {
    openai: createOpenAiTranscriptionProvider,
};

const DEFAULT_PROVIDER_ID = "openai";

/**
 * Resolves the configured provider.
 *
 * @returns The provider, or `null` when the deployment cannot transcribe audio
 */
export function getSpeechToTextProvider(): SpeechToTextProvider | null {
    const id = process.env.STT_PROVIDER ?? DEFAULT_PROVIDER_ID;
    const factory = PROVIDER_FACTORIES[id];
    return factory ? factory() : null;
}

export type {
    SpeechToTextProvider,
    TranscriptionRequest,
    TranscriptionResult,
} from "./types.js";
