/**
 * Turns a natural-language question into a Postgres `websearch_to_tsquery`
 * string that matches on *any* term rather than all of them.
 *
 * `websearch_to_tsquery` ANDs bare words, so passing a whole question through
 * unchanged asks Postgres for a chunk containing every significant word at once
 * — which real prose almost never satisfies. That made the keyword half of
 * hybrid retrieval silently dead exactly when the vector half was struggling.
 * Joining the terms with `OR` restores it as a partial-match fallback, and
 * `ts_rank_cd` still floats the chunks that matched the most terms to the top.
 *
 * The terms are re-emitted as an operator expression rather than interpolated as
 * raw tsquery syntax: `websearch_to_tsquery` never throws on malformed input, so
 * a reader's punctuation cannot turn into a query-shaped error.
 */

/** Single characters carry no signal and would match nearly every chunk. */
const MIN_TERM_LENGTH = 2;

/** Bounds the generated expression so a pasted essay cannot build a huge query. */
const MAX_TERMS = 24;

/**
 * Words `websearch_to_tsquery` reads as operators. Passing one through as a term
 * would change the shape of the expression instead of matching text.
 */
const RESERVED_WEBSEARCH_WORDS = new Set(["or", "and", "not"]);

/**
 * Runs of letters, digits, and combining marks in any script.
 *
 * Unicode-aware on purpose: a `[a-z0-9]` split would erase Devanagari, Han, and
 * Cyrillic sources entirely, which is half of why an English question found
 * nothing in a Hindi transcript.
 *
 * `\p{M}` matters as much as `\p{L}` here. Devanagari vowel signs are marks, not
 * letters, so a letters-only class cuts words at every matra — `डीएसए` ("DSA")
 * comes apart into `ड` and `एसए`, neither of which appears in the transcript.
 */
const TERM_PATTERN = /[\p{L}\p{N}\p{M}]+/gu;

/**
 * Builds an OR'd `websearch_to_tsquery` expression from a question.
 *
 * @param query - The reader's question, in any script
 * @returns Space-separated terms joined by `OR`, or `""` when the question holds
 * no usable term — callers should skip the search entirely on `""`, since an
 * empty tsquery matches nothing
 */
export function buildKeywordTsQuery(query: string): string {
    const terms: string[] = [];
    const seen = new Set<string>();

    for (const match of query.toLocaleLowerCase().matchAll(TERM_PATTERN)) {
        const term = match[0];
        if (term.length < MIN_TERM_LENGTH) continue;
        if (RESERVED_WEBSEARCH_WORDS.has(term)) continue;
        if (seen.has(term)) continue;

        seen.add(term);
        terms.push(term);
        if (terms.length === MAX_TERMS) break;
    }

    return terms.join(" OR ");
}
