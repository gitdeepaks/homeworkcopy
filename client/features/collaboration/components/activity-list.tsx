"use client";

import type { AuditEvent } from "@homeworkcopy/contracts";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { describeAuditEvent } from "../lib/activity";

type ActivityListProps = {
    events: AuditEvent[] | undefined;
    isLoading: boolean;
};

/** Who changed access or removed something, and when. */
export function ActivityList({ events, isLoading }: ActivityListProps) {
    if (isLoading) {
        return (
            <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className="h-10 rounded-md" />
                ))}
            </div>
        );
    }

    if (!events || events.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                Nothing has happened in this notebook yet. Sharing changes and
                deletions will show up here.
            </p>
        );
    }

    return (
        <ol className="divide-y rounded-md border">
            {events.map((event) => (
                <li key={event.id} className="p-3">
                    <p className="text-sm">{describeAuditEvent(event)}</p>
                    <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(event.createdAt), {
                            addSuffix: true,
                        })}
                    </p>
                </li>
            ))}
        </ol>
    );
}
