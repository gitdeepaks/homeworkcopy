"use client";

import type { BriefingOutputContent } from "@homeworkcopy/contracts";
import { StreamdownContent } from "@/shared/components/streamdown-content";

type BriefingViewerProps = {
    briefing: BriefingOutputContent;
};

function BriefingList({
    id,
    title,
    items,
}: {
    id: string;
    title: string;
    items: readonly string[];
}) {
    if (items.length === 0) {
        return null;
    }

    return (
        <section aria-labelledby={id}>
            <h3 id={id} className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {title}
            </h3>
            <ul className="mt-2 space-y-1.5">
                {items.map((item, index) => (
                    <li key={index} className="flex gap-2 text-sm">
                        <span
                            aria-hidden
                            className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                        />
                        <StreamdownContent
                            content={item}
                            mode="static"
                            className="prose prose-sm dark:prose-invert min-w-0 max-w-none [&_p]:my-0"
                        />
                    </li>
                ))}
            </ul>
        </section>
    );
}

export function BriefingViewer({ briefing }: BriefingViewerProps) {
    return (
        <article className="space-y-6">
            <header>
                <h3 className="font-heading text-xl font-semibold">
                    {briefing.headline}
                </h3>
                <StreamdownContent
                    content={briefing.summary}
                    mode="static"
                    className="prose prose-sm dark:prose-invert mt-2 max-w-none"
                />
            </header>

            <BriefingList
                id="briefing-key-points"
                title="Key points"
                items={briefing.keyPoints}
            />
            <BriefingList
                id="briefing-decisions"
                title="Decisions"
                items={briefing.decisions}
            />
            <BriefingList
                id="briefing-risks"
                title="Risks and open questions"
                items={briefing.risks}
            />
            <BriefingList
                id="briefing-next-steps"
                title="Next steps"
                items={briefing.nextSteps}
            />
        </article>
    );
}
