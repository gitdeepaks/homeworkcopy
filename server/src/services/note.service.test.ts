import { describe, expect, test } from "bun:test";
import { NOTE_TITLE_MAX_LENGTH } from "@homeworkcopy/contracts";
import { deriveTitle } from "./note.service.js";

describe("deriveTitle", () => {
    test("uses the first line of the note", () => {
        expect(deriveTitle("Entropy rises\n\nAnd never falls.")).toBe(
            "Entropy rises",
        );
    });

    test("skips leading blank lines", () => {
        expect(deriveTitle("\n\n   \nThe real first line")).toBe(
            "The real first line",
        );
    });

    test("strips a Markdown heading marker", () => {
        expect(deriveTitle("## Entropy in closed systems")).toBe(
            "Entropy in closed systems",
        );
    });

    test("truncates to the title limit", () => {
        const title = deriveTitle("x".repeat(NOTE_TITLE_MAX_LENGTH + 50));
        expect(title).toHaveLength(NOTE_TITLE_MAX_LENGTH);
    });

    test("always produces a title", () => {
        expect(deriveTitle("   \n\n  ")).toBe("Untitled note");
    });
});
