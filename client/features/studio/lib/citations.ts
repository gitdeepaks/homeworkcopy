import type { OutputContent, OutputSourceLabel } from "@homeworkcopy/contracts";
import { sourceRoutes } from "@/features/sources";

const SOURCE_MARKER = /\[(S[1-9]\d*)\]/g;

/**
 * Turns the inline `[S1]` markers a writing output may carry into links that
 * open the cited source.
 *
 * A marker the output never declared is removed rather than rendered, so the
 * reader is never shown a citation that cannot be opened.
 *
 * @param text - Generated text that may contain markers
 * @param labels - Label map persisted with the output
 * @param workspaceId - Notebook the sources belong to
 * @returns Markdown with every valid marker linked
 */
export function linkSourceMarkers(
    text: string,
    labels: readonly OutputSourceLabel[],
    workspaceId: string,
): string {
    if (labels.length === 0) {
        return text.replace(SOURCE_MARKER, "");
    }

    const byLabel = new Map(labels.map((entry) => [entry.label, entry]));

    return text.replace(SOURCE_MARKER, (_match, label: string) => {
        const source = byLabel.get(label);
        if (!source) {
            return "";
        }
        return `[${label}](${sourceRoutes.detail(workspaceId, source.sourceId)} "${source.title.replace(/"/g, "'")}")`;
    });
}

/**
 * Applies a text transform to every prose field of an output, leaving card,
 * quiz, and graph content untouched.
 *
 * @param content - Validated output content
 * @param transform - Transform applied to each prose string
 * @returns Content of the same shape with transformed prose
 */
export function mapOutputProse(
    content: OutputContent,
    transform: (text: string) => string,
): OutputContent {
    switch (content.type) {
        case "SUMMARY":
            return {
                type: content.type,
                data: { markdown: transform(content.data.markdown) },
            };
        case "TAKEAWAYS":
            return {
                type: content.type,
                data: { items: content.data.items.map(transform) },
            };
        case "REPORT":
            return {
                type: content.type,
                data: {
                    markdown: transform(content.data.markdown),
                    sections: content.data.sections.map((section) => ({
                        title: section.title,
                        content: transform(section.content),
                    })),
                },
            };
        case "STUDY_GUIDE":
            return {
                type: content.type,
                data: {
                    overview: transform(content.data.overview),
                    sections: content.data.sections.map((section) => ({
                        title: section.title,
                        summary: transform(section.summary),
                        keyPoints: section.keyPoints.map(transform),
                        studyPrompts: section.studyPrompts.map(transform),
                    })),
                    glossary: content.data.glossary.map((entry) => ({
                        term: entry.term,
                        definition: transform(entry.definition),
                    })),
                },
            };
        case "FAQ":
            return {
                type: content.type,
                data: {
                    items: content.data.items.map((item) => ({
                        question: item.question,
                        answer: transform(item.answer),
                    })),
                },
            };
        case "TIMELINE":
            return {
                type: content.type,
                data: {
                    events: content.data.events.map((event) => ({
                        label: event.label,
                        when: event.when,
                        description: transform(event.description),
                    })),
                },
            };
        case "BRIEFING":
            return {
                type: content.type,
                data: {
                    headline: content.data.headline,
                    summary: transform(content.data.summary),
                    keyPoints: content.data.keyPoints.map(transform),
                    decisions: content.data.decisions.map(transform),
                    risks: content.data.risks.map(transform),
                    nextSteps: content.data.nextSteps.map(transform),
                },
            };
        // Card, graph, spoken, and structured content carry no inline markers:
        // an audio script, a slide, and a table row each cite their sources
        // structurally rather than mid-sentence.
        case "FLASHCARDS":
        case "QUIZ":
        case "MINDMAP":
        case "AUDIO_OVERVIEW":
        case "VIDEO_EXPLAINER":
        case "SLIDES":
        case "DATA_TABLE":
            return content;
    }
}
