"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpenIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useNotebookUiStore } from "@/features/workspaces/stores/notebook-ui-store";
import { useSources } from "../hooks/use-sources";
import { sourceRoutes } from "../lib/routes";
import { AddSourceDialog } from "./add-source-dialog";
import { SourceStatusBadge } from "./source-status-badge";
import { SourceTypeIcon } from "./source-type-icon";

type SourcesPanelProps = {
    workspaceId: string;
};

const EMPTY_SELECTED_SOURCE_IDS: string[] = [];

export function SourcesPanel({ workspaceId }: SourcesPanelProps) {
    const [query, setQuery] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const { data: sources = [], isLoading, error } = useSources(workspaceId);
    const selectedSourceIds = useNotebookUiStore(
        (state) =>
            state.byNotebook[workspaceId]?.selectedSourceIds ??
            EMPTY_SELECTED_SOURCE_IDS,
    );
    const setSelectedSourceIds = useNotebookUiStore(
        (state) => state.setSelectedSourceIds,
    );

    const normalizedQuery = query.trim().toLocaleLowerCase();
    const visibleSources = normalizedQuery
        ? sources.filter((source) =>
              source.title.toLocaleLowerCase().includes(normalizedQuery),
          )
        : sources;

    function toggleSelected(sourceId: string) {
        setSelectedSourceIds(
            workspaceId,
            selectedSourceIds.includes(sourceId)
                ? selectedSourceIds.filter((id) => id !== sourceId)
                : [...selectedSourceIds, sourceId],
        );
    }

    return (
        <section aria-labelledby="sources-panel-title" className="flex h-full min-h-0 flex-col bg-panel/95">
            <div className="border-b px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h2 id="sources-panel-title" className="font-heading text-xl font-bold">Sources</h2>
                        <p className="text-xs text-muted-foreground">{sources.length} notebook references</p>
                    </div>
                    <Button size="icon-sm" onClick={() => setAddOpen(true)}>
                        <PlusIcon />
                        <span className="sr-only">Add source</span>
                    </Button>
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
                            const selected = selectedSourceIds.includes(source.id);
                            return (
                                <li key={source.id} className={cn("paper-tab group relative rounded-r-md", selected && "border-l-primary bg-primary/5")}>
                                    <button
                                        type="button"
                                        className="flex min-h-16 w-full items-start gap-2 px-2 py-2 pr-9 text-left"
                                        onClick={() => toggleSelected(source.id)}
                                        aria-pressed={selected}
                                    >
                                        <SourceTypeIcon type={source.type} className="mt-1 size-4 shrink-0" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{source.title}</span>
                                            <span className="mt-1 block"><SourceStatusBadge status={source.status} /></span>
                                        </span>
                                    </button>
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
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                {selectedSourceIds.length} selected for the next grounding phase
            </div>
            <AddSourceDialog
                workspaceId={workspaceId}
                open={addOpen}
                onOpenChange={setAddOpen}
                onSuccess={(sourceId) => {
                    setAddOpen(false);
                    setSelectedSourceIds(workspaceId, [
                        ...selectedSourceIds,
                        sourceId,
                    ]);
                }}
            />
        </section>
    );
}
