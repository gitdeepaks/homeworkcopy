import {
    OUTPUT_TYPE_GROUP,
    type AudioOverviewStyle,
    type AudioVoiceProfile,
    type OutputGenerationStage,
    type OutputGroup,
    type OutputLength,
    type OutputStatus,
    type OutputType,
} from "@homeworkcopy/contracts";

export const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
    SUMMARY: "Summary",
    TAKEAWAYS: "Key Takeaways",
    FLASHCARDS: "Flashcards",
    QUIZ: "Quiz",
    MINDMAP: "Mind Map",
    REPORT: "Report",
    STUDY_GUIDE: "Study Guide",
    FAQ: "FAQ",
    TIMELINE: "Timeline",
    BRIEFING: "Briefing Document",
    AUDIO_OVERVIEW: "Audio Overview",
};

export const OUTPUT_TYPE_DESCRIPTIONS: Record<OutputType, string> = {
    SUMMARY: "A structured markdown summary of your sources",
    TAKEAWAYS: "Bullet-point insights you can copy and review",
    FLASHCARDS: "Flip cards for active recall study",
    QUIZ: "Multiple-choice quiz with explanations",
    MINDMAP: "Visual concept map of the material",
    REPORT: "Long-form report with sections",
    STUDY_GUIDE: "Sections, key points, study prompts, and a glossary",
    FAQ: "The questions a learner asks, with direct answers",
    TIMELINE: "Events and milestones in the order they happen",
    BRIEFING: "Executive summary, decisions, risks, and next steps",
    AUDIO_OVERVIEW: "A narrated walkthrough with a cited transcript",
};

export const OUTPUT_GROUP_LABELS: Record<OutputGroup, string> = {
    "featured-media": "Featured media",
    study: "Study",
    writing: "Writing",
    saved: "Saved outputs",
};

/** Order the Studio shelves are rendered in. */
export const OUTPUT_GROUP_ORDER: readonly OutputGroup[] = [
    "featured-media",
    "study",
    "writing",
    "saved",
];

/** Output types the reader can create, grouped by Studio shelf. */
export const CREATABLE_OUTPUT_GROUPS: readonly {
    group: OutputGroup;
    types: readonly OutputType[];
}[] = [
    {
        group: "featured-media",
        types: ["AUDIO_OVERVIEW"],
    },
    {
        group: "study",
        types: ["FLASHCARDS", "QUIZ", "MINDMAP", "STUDY_GUIDE"],
    },
    {
        group: "writing",
        types: ["SUMMARY", "TAKEAWAYS", "REPORT", "FAQ", "TIMELINE", "BRIEFING"],
    },
];

export const OUTPUT_STATUS_LABELS: Record<OutputStatus, string> = {
    PENDING: "Queued",
    PROCESSING: "Generating",
    READY: "Ready",
    FAILED: "Failed",
    CANCELLED: "Cancelled",
};

/**
 * What each pipeline stage is called while a reader waits. Only the stages an
 * unfinished output can be in are worth naming.
 */
export const OUTPUT_STAGE_LABELS: Record<OutputGenerationStage, string> = {
    QUEUED: "Queued",
    GENERATING: "Generating",
    SCRIPTING: "Writing the script",
    SYNTHESIS: "Recording the audio",
    ASSEMBLY: "Assembling the audio",
    READY: "Ready",
    FAILED: "Failed",
};

export const AUDIO_STYLE_LABELS: Record<AudioOverviewStyle, string> = {
    narration: "Narration",
    dialogue: "Two-person conversation",
    briefing: "Briefing",
};

export const AUDIO_STYLES: readonly AudioOverviewStyle[] = [
    "narration",
    "dialogue",
    "briefing",
];

export const AUDIO_VOICE_LABELS: Record<AudioVoiceProfile, string> = {
    neutral: "Neutral",
    warm: "Warm",
    bright: "Bright",
};

export const AUDIO_VOICES: readonly AudioVoiceProfile[] = [
    "neutral",
    "warm",
    "bright",
];

/** Playback speeds offered by the Audio Overview player. */
export const AUDIO_PLAYBACK_RATES: readonly number[] = [
    0.75, 1, 1.25, 1.5, 1.75, 2,
];

/** Seconds a skip button moves playback. */
export const AUDIO_SKIP_SECONDS = 15;

export const OUTPUT_LENGTH_LABELS: Record<OutputLength, string> = {
    short: "Short",
    standard: "Standard",
    deep: "In depth",
};

export const OUTPUT_LENGTHS: readonly OutputLength[] = [
    "short",
    "standard",
    "deep",
];

/** Languages offered in the create dialog. Any valid code is accepted. */
export const OUTPUT_LOCALES: readonly { value: string; label: string }[] = [
    { value: "en", label: "English" },
    { value: "es", label: "Spanish" },
    { value: "fr", label: "French" },
    { value: "de", label: "German" },
    { value: "pt", label: "Portuguese" },
    { value: "hi", label: "Hindi" },
    { value: "ja", label: "Japanese" },
    { value: "zh", label: "Chinese" },
];

export { OUTPUT_TYPE_GROUP };
