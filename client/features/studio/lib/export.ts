import {
    parseOutputContent,
    readOutputMetadata,
    type OutputContent,
} from "@homeworkcopy/contracts";
import { OUTPUT_TYPE_LABELS } from "./constants";
import { mindMapOutline } from "./mindmap";
import type { StudioOutput } from "./types";

function bulletList(items: readonly string[]): string[] {
    return items.map((item) => `- ${item}`);
}

function contentToMarkdown(content: OutputContent): string[] {
    switch (content.type) {
        case "SUMMARY":
            return [content.data.markdown];
        case "REPORT":
            return [
                content.data.markdown,
                ...content.data.sections.flatMap((section) => [
                    `## ${section.title}`,
                    section.content,
                ]),
            ];
        case "TAKEAWAYS":
            return bulletList(content.data.items);
        case "FLASHCARDS":
            return content.data.cards.flatMap((card, index) => [
                `### Card ${index + 1}`,
                `**Front:** ${card.front}`,
                `**Back:** ${card.back}`,
            ]);
        case "QUIZ":
            return content.data.questions.flatMap((question, index) => [
                `### Question ${index + 1}`,
                question.question,
                ...question.options.map(
                    (option, optionIndex) =>
                        `${optionIndex === question.correctIndex ? "- [x]" : "- [ ]"} ${option}`,
                ),
                `**Why:** ${question.explanation}`,
            ]);
        case "MINDMAP":
            return mindMapOutline(content.data.nodes, content.data.edges).map(
                (row) => `${"  ".repeat(row.depth)}- ${row.label}`,
            );
        case "STUDY_GUIDE":
            return [
                content.data.overview,
                ...content.data.sections.flatMap((section) => [
                    `## ${section.title}`,
                    section.summary,
                    "**Key points**",
                    ...bulletList(section.keyPoints),
                    ...(section.studyPrompts.length > 0
                        ? ["**Study prompts**", ...bulletList(section.studyPrompts)]
                        : []),
                ]),
                ...(content.data.glossary.length > 0
                    ? [
                          "## Glossary",
                          ...content.data.glossary.map(
                              (entry) => `- **${entry.term}** — ${entry.definition}`,
                          ),
                      ]
                    : []),
            ];
        case "FAQ":
            return content.data.items.flatMap((item) => [
                `### ${item.question}`,
                item.answer,
            ]);
        case "TIMELINE":
            return content.data.events.map(
                (event) => `- **${event.when}** — ${event.label}: ${event.description}`,
            );
        case "AUDIO_OVERVIEW":
            return [
                `_${content.data.script.segments.length} segments · ${content.data.media ? `${Math.round(content.data.media.durationMs / 1_000)} seconds` : "audio pending"}_`,
                "## Transcript",
                ...content.data.script.segments.map((segment) => {
                    const speaker =
                        content.data.script.style === "dialogue"
                            ? `**${segment.speaker === "host" ? "Host" : "Guest"}:** `
                            : "";
                    const cited =
                        segment.sourceLabels.length > 0
                            ? ` ${segment.sourceLabels
                                  .map((label) => `[${label}]`)
                                  .join(" ")}`
                            : "";
                    return `${speaker}${segment.text}${cited}`;
                }),
            ];
        case "BRIEFING":
            return [
                `## ${content.data.headline}`,
                content.data.summary,
                "### Key points",
                ...bulletList(content.data.keyPoints),
                ...(content.data.decisions.length > 0
                    ? ["### Decisions", ...bulletList(content.data.decisions)]
                    : []),
                ...(content.data.risks.length > 0
                    ? ["### Risks", ...bulletList(content.data.risks)]
                    : []),
                ...(content.data.nextSteps.length > 0
                    ? ["### Next steps", ...bulletList(content.data.nextSteps)]
                    : []),
            ];
    }
}

/**
 * Renders an output as a portable Markdown document, including the sources it
 * was generated from.
 *
 * @param output - Output record from the API
 * @returns Markdown text, or a short placeholder when there is no content yet
 */
export function outputToMarkdown(output: StudioOutput): string {
    const metadata = readOutputMetadata(output.metadata);
    const content = parseOutputContent(output.type, output.content);
    const header = [
        `# ${output.title}`,
        `_${OUTPUT_TYPE_LABELS[output.type]} · Homeworkcopy_`,
    ];

    const body = content
        ? contentToMarkdown(content)
        : ["_This output has no generated content yet._"];

    // Prefer the label map so exported `[S1]` markers stay resolvable offline.
    const labels = metadata?.sourceLabels ?? [];
    const snapshotSources = metadata?.sourceSnapshot?.sources ?? [];
    const references =
        labels.length > 0
            ? [
                  "## Sources",
                  ...labels.map(
                      (source) => `- [${source.label}] ${source.title}`,
                  ),
              ]
            : snapshotSources.length > 0
              ? [
                    "## Sources",
                    ...snapshotSources.map((source) => `- ${source.title}`),
                ]
              : [];

    return [...header, ...body, ...references].join("\n\n").concat("\n");
}

/** Filename-safe slug used when the reader downloads an output. */
export function outputFileName(output: StudioOutput): string {
    const slug = output.title
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return `${slug || "output"}.md`;
}
