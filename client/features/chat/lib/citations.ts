import type { ChatCitation } from "./types";

export function getCitationByIndex(
    citations: ChatCitation[],
    index: number,
) {
    return citations[index - 1] ?? null;
}

export function uniqueCitationsBySource(citations: ChatCitation[]) {
    return citations.filter((citation, index, array) => {
        const key = citation.kind === "source" ? citation.sourceId : citation.url;
        return (
            array.findIndex(
                (item) =>
                    (item.kind === "source" ? item.sourceId : item.url) === key,
            ) === index
        );
    });
}
