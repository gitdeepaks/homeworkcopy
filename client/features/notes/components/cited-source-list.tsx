import Link from "next/link";
import type { NoteCitation } from "@homeworkcopy/contracts";
import { sourceRoutes } from "@/features/sources";

type CitedSourceListProps = {
    workspaceId: string;
    citations: readonly NoteCitation[];
};

/**
 * Describes where in a source a citation points, using whatever location the
 * source type actually has.
 */
function locationLabel(citation: NoteCitation): string | null {
    if (citation.page !== undefined) {
        return `p. ${String(citation.page)}`;
    }
    if (citation.timestamp !== undefined) {
        const total = Math.round(citation.timestamp);
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
    }
    return null;
}

/**
 * A note's citations, each opening the exact source location it points at.
 *
 * The links go to the same source viewer chat citations use, so verifying a note
 * works the same way as verifying an answer.
 */
export function CitedSourceList({
    workspaceId,
    citations,
}: CitedSourceListProps) {
    if (citations.length === 0) {
        return null;
    }

    return (
        <ul className="mt-2 flex flex-wrap gap-1.5">
            {citations.map((citation, index) => {
                const location = locationLabel(citation);

                return (
                    <li key={`${citation.sourceId}-${String(index)}`}>
                        <Link
                            href={sourceRoutes.detail(
                                workspaceId,
                                citation.sourceId,
                            )}
                            title={
                                citation.excerpt
                                    ? `“${citation.excerpt}”`
                                    : citation.title
                            }
                            className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                            <span className="truncate">{citation.title}</span>
                            {location ? (
                                <span className="shrink-0 text-muted-foreground">
                                    {location}
                                </span>
                            ) : null}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
