import {
    OUTPUT_TYPE_GROUP,
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
