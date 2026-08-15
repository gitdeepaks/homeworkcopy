"use client";

import type { TimelineOutputContent } from "@homeworkcopy/contracts";
import { StreamdownContent } from "@/shared/components/streamdown-content";

type TimelineViewerProps = {
    events: TimelineOutputContent["events"];
};

export function TimelineViewer({ events }: TimelineViewerProps) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground tabular-nums">
                {events.length} event{events.length === 1 ? "" : "s"}
            </p>
            <ol className="relative space-y-6 border-l border-border pl-6">
                {events.map((event, index) => (
                    <li key={index} className="relative">
                        <span
                            aria-hidden
                            className="absolute top-1.5 -left-[1.9rem] size-3 rounded-full border-2 border-paper bg-primary"
                        />
                        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                            {event.when}
                        </p>
                        <p className="mt-1 font-medium">{event.label}</p>
                        <StreamdownContent
                            content={event.description}
                            mode="static"
                            className="prose prose-sm dark:prose-invert mt-1 max-w-none text-muted-foreground [&_p]:my-0"
                        />
                    </li>
                ))}
            </ol>
        </div>
    );
}
