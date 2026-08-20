"use client";

import { useState } from "react";
import { FilePlus2Icon, GraduationCapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotebookCan } from "@/features/collaboration";
import { NotesList } from "@/features/notes";
import { useSources } from "@/features/sources";
import { resolveSourceSelection } from "@/features/sources/lib/grounding";
import { useNotebookUiStore } from "@/features/workspaces/stores/notebook-ui-store";
import { cn } from "@/lib/utils";
import { useOutputs } from "../hooks/use-outputs";
import { OUTPUT_GROUP_LABELS } from "../lib/constants";
import { groupOutputs } from "../lib/grouping";
import { CreateOutputDialog } from "./create-output-dialog";
import { OutputCard } from "./output-card";

type StudioPanelProps = {
    workspaceId: string;
};

const EMPTY_SOURCE_IDS: string[] = [];

type StudioSection = "outputs" | "notes";

/**
 * Studio has two shelves of its own: generated outputs, and the reader's notes.
 * Notes live here rather than as a fourth notebook tab so the mobile Sources /
 * Chat / Studio model stays intact.
 */
const STUDIO_SECTIONS: readonly { id: StudioSection; label: string }[] = [
    { id: "outputs", label: "Outputs" },
    { id: "notes", label: "Notes" },
];

export function StudioPanel({ workspaceId }: StudioPanelProps) {
    const [createOpen, setCreateOpen] = useState(false);
    // A viewer reads and exports the notebook's outputs and notes; generating a
    // new one spends the notebook's model budget, so it stays with editors.
    const canCreateOutput = useNotebookCan("output:create");
    const [section, setSection] = useState<StudioSection>("outputs");
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
            <div className="border-b border-hairline px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h2
                            id="studio-panel-title"
                            className="font-display text-xl font-semibold tracking-[-0.02em]"
                        >
                            Studio
                        </h2>
                        <p className="mt-0.5 text-xs text-graphite">
                            Study tools and saved outputs
                        </p>
                        <p className="marginalia mt-1">
                            {selection.effectiveSourceIds.length} source
                            {selection.effectiveSourceIds.length === 1
                                ? ""
                                : "s"}{" "}
                            selected
                        </p>
                    </div>
                    {canCreateOutput ? (
                        <Button
                            size="icon-sm"
                            className="size-11"
                            disabled={section === "notes"}
                            onClick={() => setCreateOpen(true)}
                        >
                            <FilePlus2Icon />
                            <span className="sr-only">Create output</span>
                        </Button>
                    ) : null}
                </div>
            </div>

            <div
                role="tablist"
                aria-label="Studio sections"
                className="flex gap-1 border-b border-hairline px-3 py-2"
            >
                {STUDIO_SECTIONS.map((option) => (
                    <button
                        key={option.id}
                        type="button"
                        role="tab"
                        id={`studio-section-${option.id}-tab`}
                        aria-selected={section === option.id}
                        aria-controls={`studio-section-${option.id}`}
                        tabIndex={section === option.id ? 0 : -1}
                        className={cn(
                            "min-h-9 rounded-sm px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            section === option.id
                                ? "bg-primary/10 font-semibold text-primary"
                                : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => setSection(option.id)}
                        onKeyDown={(event) => {
                            if (
                                event.key !== "ArrowLeft" &&
                                event.key !== "ArrowRight"
                            ) {
                                return;
                            }
                            event.preventDefault();
                            const current = STUDIO_SECTIONS.findIndex(
                                (candidate) => candidate.id === section,
                            );
                            const offset = event.key === "ArrowRight" ? 1 : -1;
                            const next =
                                STUDIO_SECTIONS[
                                    (current + offset + STUDIO_SECTIONS.length) %
                                        STUDIO_SECTIONS.length
                                ];
                            if (next) {
                                setSection(next.id);
                            }
                        }}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {section === "notes" ? (
                <div
                    id="studio-section-notes"
                    role="tabpanel"
                    aria-labelledby="studio-section-notes-tab"
                    className="min-h-0 flex-1 overflow-y-auto p-3"
                >
                    <NotesList workspaceId={workspaceId} />
                </div>
            ) : (
                <div
                    id="studio-section-outputs"
                    role="tabpanel"
                    aria-labelledby="studio-section-outputs-tab"
                    className="min-h-0 flex-1 overflow-y-auto p-3"
                >
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
            )}

            {canCreateOutput ? (
                <CreateOutputDialog
                    workspaceId={workspaceId}
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                />
            ) : null}
        </section>
    );
}
