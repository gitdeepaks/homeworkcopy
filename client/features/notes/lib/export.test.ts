import { describe, expect, test } from "bun:test";
import type { Note, NoteCitation } from "@homeworkcopy/contracts";
import { noteFileName, noteToMarkdown } from "./export";

function note(overrides: Partial<Note> = {}): Note {
    return {
        id: "note-1",
        workspaceId: "notebook-1",
        title: "Entropy in closed systems",
        content: "Entropy never decreases without work being done.",
        origin: "MANUAL",
        sourceIds: [],
        citations: null,
        savedFrom: null,
        createdAt: "2026-08-17T09:00:00.000Z",
        updatedAt: "2026-08-17T09:00:00.000Z",
        ...overrides,
    };
}

const pageCitation: NoteCitation = {
    sourceId: "src-1",
    sourceType: "PDF",
    title: "Thermodynamics",
    excerpt: "Entropy never decreases in an isolated system.",
    page: 12,
};

const timedCitation: NoteCitation = {
    sourceId: "src-2",
    sourceType: "AUDIO",
    title: "Lecture 4",
    excerpt: "",
    timestamp: 125.4,
};

describe("noteToMarkdown", () => {
    test("includes the title, the body, and where the note came from", () => {
        const markdown = noteToMarkdown(note(), []);

        expect(markdown).toContain("# Entropy in closed systems");
        expect(markdown).toContain("_Notebook note · Homeworkcopy_");
        expect(markdown).toContain("Entropy never decreases");
        expect(markdown).not.toContain("## Cited sources");
    });

    test("names a chat-saved origin", () => {
        expect(noteToMarkdown(note({ origin: "CHAT" }), [])).toContain(
            "Saved from a chat answer",
        );
    });

    test("names an output-saved origin", () => {
        expect(noteToMarkdown(note({ origin: "OUTPUT" }), [])).toContain(
            "Saved from a Studio output",
        );
    });

    test("renders each citation's location and quoted evidence", () => {
        const markdown = noteToMarkdown(note(), [pageCitation, timedCitation]);

        expect(markdown).toContain("## Cited sources");
        expect(markdown).toContain(
            "- **Thermodynamics (p. 12)** — “Entropy never decreases in an isolated system.”",
        );
        // A citation with no excerpt still records where it points.
        expect(markdown).toContain("- **Lecture 4 (at 125s)**");
    });
});

describe("noteFileName", () => {
    test("slugifies the title", () => {
        expect(noteFileName(note())).toBe("entropy-in-closed-systems.md");
    });

    test("always produces a usable name", () => {
        expect(noteFileName(note({ title: "···" }))).toBe("note.md");
    });
});
