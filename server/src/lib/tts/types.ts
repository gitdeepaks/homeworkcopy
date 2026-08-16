import type { AudioSpeaker, AudioVoiceProfile } from "@homeworkcopy/contracts";

/** One synthesis request for a single script segment. */
export type SpeechRequest = {
    /** Plain spoken text. Never contains markup or citation markers. */
    text: string;
    /** Provider-neutral voice character chosen by the reader. */
    voiceProfile: AudioVoiceProfile;
    /** Which speaker delivers this segment, so a dialogue gets two voices. */
    speaker: AudioSpeaker;
    /** BCP-47 language code the script was written in. */
    language: string;
    /** Delivery guidance the adapter may pass to vendors that support it. */
    direction: string;
};

export type SynthesizedSpeech = {
    audio: Uint8Array;
    format: "mp3";
    /** Vendor voice id used, persisted so a regeneration can be compared. */
    voiceId: string;
};

/**
 * A text-to-speech vendor.
 *
 * Audio Overview generation depends only on this interface, so swapping vendors
 * never reaches the persisted contract, the API, or the player.
 */
export type TextToSpeechProvider = {
    /** Stable id persisted on generated media, e.g. `openai`. */
    readonly id: string;
    /** Vendor model id persisted alongside the media. */
    readonly model: string;
    /** Largest `text` this provider accepts in one request. */
    readonly maxInputLength: number;
    synthesize(request: SpeechRequest): Promise<SynthesizedSpeech>;
};
