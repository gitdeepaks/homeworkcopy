"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpenIcon, PlusIcon, RotateCcwIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useNotebookCan } from "@/features/collaboration";
import { useNotebookUiStore } from "@/features/workspaces/stores/notebook-ui-store";
import { useDeleteSource, useReprocessSource, useSources } from "../hooks/use-sources";
import { sourceRoutes } from "../lib/routes";
import { AddSourceDialog } from "./add-source-dialog";
import { SourceStatusBadge } from "./source-status-badge";
import { SourceTypeIcon } from "./source-type-icon";
import { resolveSourceSelection } from "../lib/grounding";

type SourcesPanelProps = {
    workspaceId: string;
};

const EMPTY_SELECTED_SOURCE_IDS: string[] = [];

export function SourcesPanel({ workspaceId }: SourcesPanelProps) {
    const [query, setQuery] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    // A viewer reads the same list, selects the same sources for grounding, and
    // opens the same documents — they simply cannot change what is in it.
    const canAddSources = useNotebookCan("source:create");
    const canRemoveSources = useNotebookCan("source:delete");
    const canReprocess = useNotebookCan("source:reprocess");
    const { data: sources = [], isLoading, error } = useSources(workspaceId);
    const deleteSource = useDeleteSource(workspaceId);
    const reprocessSource = useReprocessSource(workspaceId);
    const selectedSourceIds = useNotebookUiStore(
        (state) =>
            state.byNotebook[workspaceId]?.selectedSourceIds ??
            EMPTY_SELECTED_SOURCE_IDS,
    );
    const selectionMode = useNotebookUiStore(
        (state) =>
            state.byNotebook[workspaceId]?.sourceSelectionMode ?? "all-ready",
    );
    const setSelectionMode = useNotebookUiStore(
        (state) => state.setSourceSelectionMode,
    );
    const setSelectedSourceIds = useNotebookUiStore(
        (state) => state.setSelectedSourceIds,
    );
    const addSelectedSourceId = useNotebookUiStore(
        (state) => state.addSelectedSourceId,
    );

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const selection = resolveSourceSelection(
        sources,
        selectionMode,
        selectedSourceIds,
    );
    const visibleSources = normalizedQuery
        ? sources.filter((source) =>
              source.title.toLocaleLowerCase().includes(normalizedQuery),
          )
        : sources;

    function toggleSelected(sourceId: string) {
        const currentIds =
            selectionMode === "all-ready"
                ? selection.readySourceIds
                : selectedSourceIds;
        setSelectionMode(workspaceId, "custom");
        setSelectedSourceIds(
            workspaceId,
            currentIds.includes(sourceId)
                ? currentIds.filter((id) => id !== sourceId)
                : [...currentIds, sourceId],
        );
    }

    return (
        <section aria-labelledby="sources-panel-title" className="flex h-full min-h-0 flex-col bg-panel/95">
            <div className="border-b border-hairline px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h2 id="sources-panel-title" className="font-display text-xl font-semibold tracking-[-0.02em]">Sources</h2>
                        <p className="marginalia mt-1">{sources.length} references</p>
                    </div>
                    {canAddSources ? (
                        <Button
                            size="icon-sm"
                            className="size-11"
                            onClick={() => setAddOpen(true)}
                        >
                            <PlusIcon />
                            <span className="sr-only">Add source</span>
                        </Button>
                    ) : null}
                </div>
                <div className="relative mt-3">
                    <SearchIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Find a source"
                        aria-label="Search notebook sources"
                        className="h-9 bg-paper pl-8"
                    />
                </div>
                <div className="mt-2 flex items-center gap-2">
                    <Button
                        type="button"
                        variant={selectionMode === "all-ready" ? "secondary" : "outline"}
                        size="xs"
                        onClick={() => setSelectionMode(workspaceId, "all-ready")}
                    >
                        All ready
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        disabled={selection.readySourceIds.length === 0}
                        onClick={() => {
                            setSelectionMode(workspaceId, "custom");
                            setSelectedSourceIds(workspaceId, selection.readySourceIds);
                        }}
                    >
                        Select all
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                            setSelectionMode(workspaceId, "custom");
                            setSelectedSourceIds(workspaceId, []);
                        }}
                    >
                        Clear
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {isLoading ? (
                    <div className="space-y-2 p-1">
                        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-16" />)}
                    </div>
                ) : error ? (
                    <p role="alert" className="p-3 text-sm text-destructive">Could not load sources.</p>
                ) : visibleSources.length === 0 ? (
                    <div className="grid place-items-center gap-2 px-3 py-12 text-center">
                        <BookOpenIcon className="size-6 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">{query ? "No matching sources." : "Add a source to begin."}</p>
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {visibleSources.map((source) => {
                            const selected = selection.effectiveSourceIds.includes(source.id);
                            const selectable = source.status === "READY";
                            return (
                                <li key={source.id} className={cn("paper-tab group relative rounded-r-md", selected && "border-l-primary bg-primary/5")}>
                                    <div className="flex min-h-16 w-full items-start gap-2 px-2 py-2 pr-28 text-left">
                                        <Checkbox
                                            className="mt-1"
                                            checked={selected}
                                            disabled={!selectable}
                                            aria-label={`${selected ? "Deselect" : "Select"} ${source.title} for grounding`}
                                            onCheckedChange={() => toggleSelected(source.id)}
                                        />
                                        <SourceTypeIcon type={source.type} className="mt-1 size-4 shrink-0" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{source.title}</span>
                                            <span className="mt-1 block"><SourceStatusBadge status={source.status} stage={source.processingStage} /></span>
                                            {source.status === "FAILED" && source.metadata?.processingError ? (
                                                <span className="mt-1 line-clamp-2 block text-xs text-destructive">{source.metadata.processingError}</span>
                                            ) : null}
                                            {source.status === "DELETING" && source.metadata?.cleanupError ? (
                                                <span className="mt-1 line-clamp-2 block text-xs text-destructive">{source.metadata.cleanupError}</span>
                                            ) : null}
                                        </span>
                                    </div>
                                    <Button
                                        nativeButton={false}
                                        variant="ghost"
                                        size="icon-sm"
                                        className="absolute top-3 right-1"
                                        render={<Link href={sourceRoutes.detail(workspaceId, source.id)} />}
                                    >
                                        <BookOpenIcon />
                                        <span className="sr-only">Open {source.title}</span>
                                    </Button>
                                    {source.status === "FAILED" && canReprocess ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="absolute top-3 right-9"
                                            disabled={reprocessSource.isPending}
                                            onClick={() => reprocessSource.mutate(source.id)}
                                        >
                                            <RotateCcwIcon />
                                            <span className="sr-only">Retry {source.title}</span>
                                        </Button>
                                    ) : !canRemoveSources ? null : source.status !== "DELETING" ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="absolute top-3 right-9"
                                            disabled={deleteSource.isPending}
                                            onClick={() => {
                                                if (window.confirm(`Remove “${source.title}” and its indexed data?`)) {
                                                    deleteSource.mutate(source.id);
                                                }
                                            }}
                                        >
                                            <Trash2Icon />
                                            <span className="sr-only">{source.status === "READY" ? "Remove" : "Cancel and remove"} {source.title}</span>
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="absolute top-3 right-9"
                                            disabled={deleteSource.isPending}
                                            onClick={() => deleteSource.mutate(source.id)}
                                        >
                                            <RotateCcwIcon />
                                            <span className="sr-only">Retry cleanup for {source.title}</span>
                                        </Button>
                                    )}
                                    {source.status === "FAILED" && canRemoveSources ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            className="absolute top-3 right-[4.5rem]"
                                            disabled={deleteSource.isPending}
                                            onClick={() => {
                                                if (window.confirm(`Remove “${source.title}” and its indexed data?`)) {
                                                    deleteSource.mutate(source.id);
                                                }
                                            }}
                                        >
                                            <Trash2Icon />
                                            <span className="sr-only">Remove {source.title}</span>
                                        </Button>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                <span aria-live="polite">
                    {selection.effectiveSourceIds.length} source
                    {selection.effectiveSourceIds.length === 1 ? "" : "s"} selected
                </span>
                {selection.unavailableSourceIds.length > 0 ? (
                    <div role="alert" className="mt-2 text-amber-700 dark:text-amber-300">
                        {selection.unavailableSourceIds.length} selected source
                        {selection.unavailableSourceIds.length === 1 ? " is" : "s are"} unavailable.
                        <Button
                            type="button"
                            variant="link"
                            size="xs"
                            className="ml-1 h-auto p-0 text-current"
                            onClick={() =>
                                setSelectedSourceIds(
                                    workspaceId,
                                    selection.effectiveSourceIds,
                                )
                            }
                        >
                            Remove unavailable
                        </Button>
                    </div>
                ) : null}
                {selection.exceedsSourceLimit ? (
                    <p role="alert" className="mt-2 text-amber-700 dark:text-amber-300">
                        Choose a custom selection of at most 50 sources.
                    </p>
                ) : null}
            </div>
            {canAddSources ? (
                <AddSourceDialog
                    workspaceId={workspaceId}
                    open={addOpen}
                    onOpenChange={setAddOpen}
                    onSuccess={(sourceId) =>
                        addSelectedSourceId(workspaceId, sourceId)
                    }
                />
            ) : null}
        </section>
    );
}
