"use client";

import { useState } from "react";
import { FilePlus2Icon, GraduationCapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSources } from "@/features/sources";
import { resolveSourceSelection } from "@/features/sources/lib/grounding";
import { useNotebookUiStore } from "@/features/workspaces/stores/notebook-ui-store";
import { useOutputs } from "../hooks/use-outputs";
import { OUTPUT_GROUP_LABELS } from "../lib/constants";
import { groupOutputs } from "../lib/grouping";
import { CreateOutputDialog } from "./create-output-dialog";
import { OutputCard } from "./output-card";

type StudioPanelProps = {
    workspaceId: string;
};

const EMPTY_SOURCE_IDS: string[] = [];

export function StudioPanel({ workspaceId }: StudioPanelProps) {
    const [createOpen, setCreateOpen] = useState(false);
    const { data: outputs = [], isLoading, error } = useOutputs(workspaceId);
    const { data: sources = [] } = useSources(workspaceId);
    const selectionMode = useNotebookUiStore(
        (state) =>
            state.byNotebook[workspaceId]?.sourceSelectionMode ?? "all-ready",
    );
    const selectedSourceIds = useNotebookUiStore(
        (state) =>
            state.byNotebook[workspaceId]?.selectedSourceIds ?? EMPTY_SOURCE_IDS,
    );
    const selection = resolveSourceSelection(
        sources,
        selectionMode,
        selectedSourceIds,
    );
    const shelves = groupOutputs(outputs);

    return (
        <section
            aria-labelledby="studio-panel-title"
            className="flex h-full min-h-0 flex-col bg-panel/95"
        >
            <div className="border-b px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h2
                            id="studio-panel-title"
                            className="font-heading text-xl font-bold"
                        >
                            Studio
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            Study tools and saved outputs
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {selection.effectiveSourceIds.length} source
                            {selection.effectiveSourceIds.length === 1
                                ? ""
                                : "s"}{" "}
                            selected
                        </p>
                    </div>
                    <Button size="icon-sm" onClick={() => setCreateOpen(true)}>
                        <FilePlus2Icon />
                        <span className="sr-only">Create output</span>
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {isLoading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <Skeleton key={index} className="h-24" />
                        ))}
                    </div>
                ) : error ? (
                    <p role="alert" className="text-sm text-destructive">
                        Could not load outputs.
                    </p>
                ) : outputs.length === 0 ? (
                    <div className="grid place-items-center gap-3 py-12 text-center">
                        <GraduationCapIcon className="size-7 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">
                                Your desk is clear
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Turn notebook sources into a study output.
                            </p>
                        </div>
                        <Button size="sm" onClick={() => setCreateOpen(true)}>
                            Create output
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-5">
                        {shelves.map((shelf) => (
                            <section
                                key={shelf.group}
                                aria-labelledby={`studio-shelf-${shelf.group}`}
                            >
                                <h3
                                    id={`studio-shelf-${shelf.group}`}
                                    className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                                >
                                    {OUTPUT_GROUP_LABELS[shelf.group]}
                                </h3>
                                <ul className="space-y-3">
                                    {shelf.outputs.map((output) => (
                                        <li key={output.id}>
                                            <OutputCard output={output} />
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </div>

            <CreateOutputDialog
                workspaceId={workspaceId}
                open={createOpen}
                onOpenChange={setCreateOpen}
            />
        </section>
    );
}
