"use client";

import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card";
import type { ChatCitation } from "../lib/types";
import { useNotebookUiStore } from "@/features/workspaces/stores/notebook-ui-store";
import { CitationPreview } from "./citation-preview";
import { cn } from "@/lib/utils";

type CitationMarkerProps = {
    index: number;
    citation: ChatCitation;
    workspaceId: string;
    prefix?: string;
    citations: ChatCitation[];
};

export function CitationMarker({
    index,
    citation,
    workspaceId,
    prefix,
    citations,
}: CitationMarkerProps) {
    const label = prefix ? `${prefix}${index}` : String(index);
    const openCitation = useNotebookUiStore((state) => state.openCitation);
    const unavailable =
        citation.kind === "source" &&
        citation.availability !== undefined &&
        citation.availability !== "available";

    return (
        <HoverCard>
            <HoverCardTrigger
                delay={120}
                closeDelay={80}
                render={
                    <button
                        type="button"
                        className={cn(
                            "mx-0.5 inline-flex h-5 min-w-5 -translate-y-1 items-center justify-center border-b-2 px-1 align-middle font-mono text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                            citation.kind === "web"
                                ? "border-sky-600 bg-sky-500/15 text-sky-700 hover:bg-sky-500/25 dark:text-sky-300"
                                : "border-primary bg-highlighter text-primary hover:bg-highlighter/80",
                        )}
                        aria-label={`${unavailable ? "Unavailable citation" : citation.kind === "web" ? "Web citation" : "Notebook citation"} ${label}: ${citation.title}`}
                        aria-haspopup="dialog"
                        onClick={() =>
                            openCitation(workspaceId, citation, citations)
                        }
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
                    citations={citations}
                />
            </HoverCardContent>
        </HoverCard>
    );
}
