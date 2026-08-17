import type { Note, NoteCitation } from "@homeworkcopy/contracts";

/**
 * Renders one citation as a Markdown reference, including the location that
 * makes it verifiable.
 */
function citationLine(citation: NoteCitation): string {
    const location = [
        citation.page === undefined ? null : `p. ${String(citation.page)}`,
        citation.timestamp === undefined
            ? null
            : `at ${String(Math.round(citation.timestamp))}s`,
    ]
        .filter((part): part is string => part !== null)
        .join(", ");

    const heading = location ? `${citation.title} (${location})` : citation.title;
    return citation.excerpt
        ? `- **${heading}** — “${citation.excerpt}”`
        : `- **${heading}**`;
}

/**
 * Renders a note as a portable Markdown document.
 *
 * Markdown first, by design: it is the format a reader can paste anywhere and
 * the one every other export can be generated from later.
 *
 * @param note - Note record from the API
 * @param citations - Its parsed citations
 * @returns Markdown text
 */
export function noteToMarkdown(
    note: Note,
    citations: readonly NoteCitation[],
): string {
    const origin =
        note.origin === "CHAT"
            ? "Saved from a chat answer"
            : note.origin === "OUTPUT"
              ? "Saved from a Studio output"
              : "Notebook note";

    return [
        `# ${note.title}`,
        `_${origin} · Homeworkcopy_`,
        note.content,
        ...(citations.length > 0
            ? ["## Cited sources", ...citations.map(citationLine)]
            : []),
    ]
        .join("\n\n")
        .concat("\n");
}

/** Filename-safe slug used when the reader downloads a note. */
export function noteFileName(note: Note): string {
    const slug = note.title
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
    return `${slug || "note"}.md`;
}
