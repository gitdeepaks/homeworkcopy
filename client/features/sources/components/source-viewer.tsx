"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    ExternalLinkIcon,
    FileWarningIcon,
    SearchIcon,
} from "lucide-react";
import type { Citation, SourceCitation } from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/shared/lib/api";
import {
    selectNotebookViewState,
    useNotebookUiStore,
} from "@/features/workspaces/stores/notebook-ui-store";
import { useSourceChunks } from "../hooks/use-sources";
import { SOURCE_TYPE_LABELS } from "../lib/constants";
import { sourceRoutes } from "../lib/routes";
import type { SourceChunk } from "../lib/types";

type SourceViewerProps = {
    workspaceId: string;
};

function formatTimestamp(seconds: number) {
    const wholeSeconds = Math.floor(seconds);
    const minutes = Math.floor(wholeSeconds / 60);
    const remaining = wholeSeconds % 60;
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function HighlightedEvidence({ text, excerpt }: { text: string; excerpt: string }) {
    const evidence = excerpt.trim();
    const index = evidence
        ? text.toLocaleLowerCase().indexOf(evidence.toLocaleLowerCase())
        : -1;
    if (index < 0) return <>{text}</>;

    return (
        <>
            {text.slice(0, index)}
            <mark className="rounded-sm bg-highlighter px-0.5 text-inherit">
                {text.slice(index, index + evidence.length)}
            </mark>
            {text.slice(index + evidence.length)}
        </>
    );
}

function locationLabel(citation: SourceCitation, chunk?: SourceChunk) {
    const page = citation.page ?? chunk?.metadata?.page;
    const timestamp = citation.timestamp ?? chunk?.metadata?.timestamp;
    if (page) return `Page ${page}`;
    if (timestamp !== undefined) return formatTimestamp(timestamp);
    if (citation.chunkIndex !== undefined) return `Passage ${citation.chunkIndex + 1}`;
    return "Source excerpt";
}

export function SourceViewer({ workspaceId }: SourceViewerProps) {
    const [search, setSearch] = useState("");
    const viewState = useNotebookUiStore((state) =>
        selectNotebookViewState(state, workspaceId),
    );
    const openCitation = useNotebookUiStore((state) => state.openCitation);
    const closeSourceViewer = useNotebookUiStore(
        (state) => state.closeSourceViewer,
    );
    const citation = viewState.activeCitation;
    const sourceId =
        citation?.kind === "source"
            ? citation.sourceId
            : viewState.activeSourceId;
    const query = useSourceChunks(workspaceId, sourceId);
    const unavailable =
        citation?.kind === "source" &&
        citation.availability !== undefined &&
        citation.availability !== "available";
    const source = query.data?.source;
    const chunks = query.data?.chunks ?? [];
    const exactChunk =
        citation?.kind === "source"
            ? chunks.find((chunk) => chunk.id === citation.chunkId) ??
              chunks.find((chunk) => chunk.index === citation.chunkIndex)
            : undefined;
    const exactIndex = exactChunk ? chunks.indexOf(exactChunk) : -1;
    const nearbyChunks =
        exactIndex >= 0
            ? chunks.slice(Math.max(0, exactIndex - 1), exactIndex + 2)
            : chunks;
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const visibleChunks = normalizedSearch
        ? chunks.filter((chunk) =>
              chunk.content.toLocaleLowerCase().includes(normalizedSearch),
          )
        : nearbyChunks;
    const sequenceIndex = citation
        ? viewState.citationSequence.findIndex(
              (item) => item.kind === citation.kind && item.label === citation.label,
          )
        : -1;
    const previous =
        sequenceIndex > 0
            ? viewState.citationSequence[sequenceIndex - 1]
            : undefined;
    const next =
        sequenceIndex >= 0
            ? viewState.citationSequence[sequenceIndex + 1]
            : undefined;

    useEffect(() => {
        setSearch("");
    }, [citation?.label, sourceId]);

    function navigate(target: Citation | undefined) {
        if (target) {
            openCitation(workspaceId, target, viewState.citationSequence);
        }
    }

    const title = citation?.title ?? source?.title ?? "Source viewer";
    const originalUrl =
        citation?.kind === "web"
            ? citation.url
            : source?.type === "PDF"
              ? source.metadata?.fileUrl ?? source.url
              : source?.url;
    const timestamp =
        citation?.kind === "source"
            ? citation.timestamp ?? exactChunk?.metadata?.timestamp
            : undefined;
    const originalWithLocation =
        source?.type === "YOUTUBE" && originalUrl && timestamp !== undefined
            ? `${originalUrl}${originalUrl.includes("?") ? "&" : "?"}t=${Math.floor(timestamp)}s`
            : originalUrl;

    return (
        <Sheet
            open={citation !== null || viewState.activeSourceId !== null}
            onOpenChange={(open) => {
                if (!open) closeSourceViewer(workspaceId);
            }}
        >
            <SheetContent
                side="right"
                className="ruled-paper h-svh w-full max-w-none sm:max-w-2xl lg:w-[min(48rem,62vw)] lg:max-w-none"
            >
                <SheetHeader className="border-b bg-paper/95 pr-14">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <span>{source ? SOURCE_TYPE_LABELS[source.type] : citation?.kind === "web" ? "Web" : "Source"}</span>
                        {citation?.kind === "source" ? (
                            <span>· {locationLabel(citation, exactChunk)}</span>
                        ) : null}
                    </div>
                    <SheetTitle>{title}</SheetTitle>
                    <SheetDescription>
                        {citation
                            ? `Citation ${citation.label}. Supporting evidence is highlighted when the exact passage is available.`
                            : "Read the indexed source without leaving your conversation."}
                    </SheetDescription>
                </SheetHeader>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {citation && viewState.citationSequence.length > 1 ? (
                        <div className="flex items-center justify-between border-b bg-paper px-4 py-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={!previous}
                                onClick={() => navigate(previous)}
                            >
                                <ArrowLeftIcon /> Previous citation
                            </Button>
                            <span className="text-xs tabular-nums text-muted-foreground">
                                {sequenceIndex + 1} of {viewState.citationSequence.length}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={!next}
                                onClick={() => navigate(next)}
                            >
                                Next citation <ArrowRightIcon />
                            </Button>
                        </div>
                    ) : null}

                    {citation?.kind === "web" ? (
                        <div className="flex-1 overflow-y-auto p-5 sm:p-8">
                            <blockquote className="paper-sheet border-l-4 border-margin-line p-5 text-base leading-8">
                                <HighlightedEvidence
                                    text={citation.excerpt}
                                    excerpt={citation.excerpt}
                                />
                            </blockquote>
                            <p className="mt-4 text-sm text-muted-foreground">
                                This web result stores the cited excerpt. Open the original page to inspect its full context.
                            </p>
                        </div>
                    ) : unavailable || (query.error instanceof ApiError && query.error.status === 404) ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center" role="status">
                            <FileWarningIcon className="size-9 text-muted-foreground" />
                            <p className="font-heading text-lg font-semibold">Citation source unavailable</p>
                            <p className="max-w-md text-sm text-muted-foreground">
                                The source or indexed passage was deleted after this answer was created. The saved evidence excerpt remains below for context.
                            </p>
                            {citation?.kind === "source" && citation.excerpt ? (
                                <blockquote className="mt-3 max-w-xl border-l-4 border-margin-line bg-paper p-4 text-left text-sm leading-7">
                                    {citation.excerpt}
                                </blockquote>
                            ) : null}
                        </div>
                    ) : query.isLoading ? (
                        <div className="space-y-4 p-6" aria-live="polite">
                            <span className="sr-only">Loading cited source</span>
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-40 w-full" />
                            <Skeleton className="h-40 w-full" />
                        </div>
                    ) : query.error || !source ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center" role="alert">
                            <p className="font-medium">Could not load this source</p>
                            <Button variant="outline" onClick={() => void query.refetch()}>
                                Try again
                            </Button>
                        </div>
                    ) : (
                        <>
                            {source.type === "PDF" && source.metadata?.fileUrl ? (
                                <iframe
                                    title={`${source.title}, cited PDF`}
                                    src={`${source.metadata.fileUrl}${citation?.kind === "source" && citation.page ? `#page=${citation.page}` : ""}`}
                                    className="min-h-64 flex-[1.2] border-b bg-white"
                                />
                            ) : source.type === "YOUTUBE" && source.metadata?.videoId ? (
                                <div className="aspect-video shrink-0 bg-black">
                                    <iframe
                                        title={`${source.title}, cited video`}
                                        src={`https://www.youtube-nocookie.com/embed/${source.metadata.videoId}${timestamp !== undefined ? `?start=${Math.floor(timestamp)}` : ""}`}
                                        className="size-full"
                                        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    />
                                </div>
                            ) : null}

                            <div className="flex items-center gap-2 border-b bg-paper p-3">
                                <SearchIcon className="size-4 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search this source"
                                    aria-label="Search this source"
                                    className="h-9 bg-paper"
                                />
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth p-4 sm:p-7">
                                {visibleChunks.length ? (
                                    <div className="mx-auto max-w-3xl space-y-4">
                                        {visibleChunks.map((chunk) => {
                                            const selected = chunk.id === exactChunk?.id;
                                            return (
                                                <section
                                                    key={chunk.id}
                                                    aria-label={`Passage ${chunk.index + 1}`}
                                                    className={selected ? "paper-sheet border-l-4 border-margin-line p-4 shadow-sm" : "border-l-4 border-transparent p-4"}
                                                >
                                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                                        {chunk.metadata?.page
                                                            ? `Page ${chunk.metadata.page}`
                                                            : chunk.metadata?.timestamp !== undefined
                                                              ? formatTimestamp(chunk.metadata.timestamp)
                                                              : `Passage ${chunk.index + 1}`}
                                                    </p>
                                                    <p className="whitespace-pre-wrap text-sm leading-7">
                                                        <HighlightedEvidence
                                                            text={chunk.content}
                                                            excerpt={selected && citation?.kind === "source" ? citation.excerpt : search}
                                                        />
                                                    </p>
                                                </section>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="py-12 text-center text-sm text-muted-foreground">
                                        No indexed passage matches that search.
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-paper p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                    <Button variant="ghost" onClick={() => closeSourceViewer(workspaceId)}>
                        <ArrowLeftIcon /> Back to chat
                    </Button>
                    <div className="flex gap-2">
                        {sourceId ? (
                            <Button
                                nativeButton={false}
                                variant="outline"
                                render={<Link href={sourceRoutes.detail(workspaceId, sourceId)} />}
                            >
                                Full view
                            </Button>
                        ) : null}
                        {originalWithLocation ? (
                            <Button
                                nativeButton={false}
                                render={
                                    <a
                                        href={originalWithLocation}
                                        target="_blank"
                                        rel="noreferrer"
                                    />
                                }
                            >
                                Open original <ExternalLinkIcon />
                            </Button>
                        ) : null}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
