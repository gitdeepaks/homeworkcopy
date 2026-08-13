"use client";

import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { ChatCitation } from "../lib/types";
import { CitationPreview } from "./citation-preview";

type CitationMarkerProps = {
    index: number;
    citation: ChatCitation;
    workspaceId: string;
    prefix?: string;
};

export function CitationMarker({
    index,
    citation,
    workspaceId,
    prefix,
}: CitationMarkerProps) {
    const label = prefix ? `${prefix}${index}` : String(index);

    return (
        <HoverCard>
            <HoverCardTrigger
                delay={120}
                closeDelay={80}
                render={
                    <button
                        type="button"
                        className="mx-0.5 inline-flex h-5 min-w-5 -translate-y-1 items-center justify-center border-b-2 border-primary bg-highlighter px-1 align-middle font-mono text-[10px] font-bold text-primary transition-colors hover:bg-highlighter/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        aria-label={`Source ${label}: ${citation.title}`}
                    >
                        {label}
                    </button>
                }
            />
            <HoverCardContent side="top" align="start" className="paper-sheet w-80 rounded-md">
                <CitationPreview
                    citation={citation}
                    workspaceId={workspaceId}
                    markerIndex={index}
                />
            </HoverCardContent>
        </HoverCard>
    );
}
