"use client";

import {
    BookOpenIcon,
    ExternalLinkIcon,
    FileTextIcon,
    GlobeIcon,
    PlusIcon,
    VideoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useImportWebSearchSource } from "@/features/sources/hooks/use-sources";
import { SOURCE_TYPE_LABELS } from "@/features/sources/lib/constants";
import { useNotebookUiStore } from "@/features/workspaces/stores/notebook-ui-store";
import type { ChatCitation } from "../lib/types";

type CitationPreviewProps = {
    citation: ChatCitation;
    workspaceId: string;
    markerIndex?: number;
    citations?: ChatCitation[];
};

function SourceTypeIcon({ type }: { type: ChatCitation["kind"] extends "source" ? never : string }) {
    switch (type) {
        case "PDF":
            return <FileTextIcon className="size-3.5" />;
        case "WEBSITE":
            return <GlobeIcon className="size-3.5" />;
        case "YOUTUBE":
            return <VideoIcon className="size-3.5" />;
        default:
            return <BookOpenIcon className="size-3.5" />;
    }
}

export function CitationPreview({
    citation,
    workspaceId,
    markerIndex,
    citations = [citation],
}: CitationPreviewProps) {
    const importWebSearch = useImportWebSearchSource(workspaceId);
    const openCitation = useNotebookUiStore((state) => state.openCitation);
    const sourceType = citation.kind === "web" ? "Web" : SOURCE_TYPE_LABELS[citation.sourceType];

    return (
        <div className="space-y-3">
            <div className="flex items-start gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-muted">
                    <SourceTypeIcon type={citation.kind === "web" ? "WEBSITE" : citation.sourceType} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                        {markerIndex != null ? (
                            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                                {markerIndex}
                            </span>
                        ) : null}
                        <p className="truncate font-medium leading-tight">
                            {citation.title}
                        </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {sourceType}
                        {citation.page ? ` · Page ${citation.page}` : null}
                    </p>
                </div>
            </div>

            <p className="line-clamp-5 text-xs leading-relaxed text-muted-foreground">
                {citation.excerpt}
            </p>

            {citation.kind === "web" ? (
                <div className="flex flex-wrap gap-2">
                    <a
                        href={citation.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                        <ExternalLinkIcon className="size-3" />
                        Open link
                    </a>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={importWebSearch.isPending}
                        onClick={() =>
                            void importWebSearch.mutateAsync({
                                title: citation.title,
                                content: citation.excerpt,
                                url: citation.url,
                            })
                        }
                    >
                        <PlusIcon className="size-3" />
                        Save to library
                    </Button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => openCitation(workspaceId, citation, citations)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                    <ExternalLinkIcon className="size-3" />
                    {citation.availability && citation.availability !== "available"
                        ? "View saved excerpt"
                        : "Open source"}
                </button>
            )}
        </div>
    );
}
