import { describe, expect, test } from "bun:test";
import { buildKeywordTsQuery } from "./keyword-query.js";

describe("keyword tsquery", () => {
    test("ORs the terms of a question instead of ANDing them", () => {
        const query = buildKeywordTsQuery("What does the speaker say about DSA patterns?");
        expect(query).toBe("what OR does OR the OR speaker OR say OR about OR dsa OR patterns");
    });

    test("keeps Devanagari words whole across their combining marks", () => {
        const terms = buildKeywordTsQuery("डीएसए सीखने के बारे में").split(" OR ");
        expect(terms).toEqual(["डीएसए", "सीखने", "के", "बारे", "में"]);
    });

    test("drops websearch operator words that would reshape the query", () => {
        const query = buildKeywordTsQuery("recursion or iteration and not memoization");
        expect(query).toBe("recursion OR iteration OR memoization");
    });

    test("drops single characters and repeated terms", () => {
        const query = buildKeywordTsQuery("a big O of a big tree");
        expect(query).toBe("big OR of OR tree");
    });

    test("caps the term count so a pasted essay cannot build a huge query", () => {
        const essay = Array.from({ length: 100 }, (_, index) => `term${index}`).join(" ");
        expect(buildKeywordTsQuery(essay).split(" OR ")).toHaveLength(24);
    });

    test("returns empty for a question with no usable term", () => {
        expect(buildKeywordTsQuery("?! -- ???")).toBe("");
        expect(buildKeywordTsQuery("   ")).toBe("");
    });
});
