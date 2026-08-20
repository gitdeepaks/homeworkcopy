"use client";

import {
    DATA_CATEGORY_LABELS,
    type DataProcessor,
} from "@homeworkcopy/contracts";
import { Badge } from "@/components/ui/badge";

/**
 * Who receives data, right now, given this reader's choices.
 *
 * The list is the reader's own, not a generic notice: a provider they have
 * declined does not appear, because "here is everything that could happen to
 * anyone's data" is a legal document and "here is where yours goes" is an
 * answer.
 */
export function ProcessorTable({
    processors,
}: {
    processors: readonly DataProcessor[];
}) {
    return (
        <div className="space-y-3">
            {processors.map((processor) => (
                <div key={processor.id} className="paper-sheet rounded-md p-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{processor.name}</span>
                        <Badge
                            variant={
                                processor.necessity === "required"
                                    ? "secondary"
                                    : "outline"
                            }
                        >
                            {processor.necessity === "required"
                                ? "Required"
                                : "Optional"}
                        </Badge>
                        {processor.retainsContent ? (
                            <Badge variant="outline">Stores what it receives</Badge>
                        ) : (
                            <Badge variant="outline">Processes without storing</Badge>
                        )}
                    </div>

                    <p className="mt-2 text-sm text-muted-foreground">
                        {processor.purpose}
                    </p>

                    <ul className="mt-2 space-y-1">
                        {processor.categories.map((category) => (
                            <li
                                key={category}
                                className="text-xs text-muted-foreground"
                            >
                                {DATA_CATEGORY_LABELS[category]}
                            </li>
                        ))}
                    </ul>

                    <a
                        href={processor.policyUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-3 inline-block text-xs underline underline-offset-2"
                    >
                        {processor.name} privacy policy
                    </a>
                </div>
            ))}
        </div>
    );
}
