"use client";

import { useState } from "react";
import Link from "next/link";
import { FilePlus2Icon, GraduationCapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useArtifacts } from "../hooks/use-artifacts";
import { ARTIFACT_TYPE_LABELS } from "../lib/constants";
import { learnRoutes } from "../lib/routes";
import { ArtifactStatusBadge, ArtifactTypeBadge } from "./artifact-status-badge";
import { GenerateArtifactDialog } from "./generate-artifact-dialog";
import { useSources } from "@/features/sources";
import { resolveSourceSelection } from "@/features/sources/lib/grounding";
import { useNotebookUiStore } from "@/features/workspaces/stores/notebook-ui-store";

type StudioPanelProps = {
    workspaceId: string;
};

const EMPTY_SOURCE_IDS: string[] = [];

export function StudioPanel({ workspaceId }: StudioPanelProps) {
    const [generateOpen, setGenerateOpen] = useState(false);
    const { data: artifacts = [], isLoading, error } = useArtifacts(workspaceId);
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

    return (
        <section aria-labelledby="studio-panel-title" className="flex h-full min-h-0 flex-col bg-panel/95">
            <div className="border-b px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h2 id="studio-panel-title" className="font-heading text-xl font-bold">Studio</h2>
                        <p className="text-xs text-muted-foreground">Study tools and saved outputs</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {selection.effectiveSourceIds.length} source
                            {selection.effectiveSourceIds.length === 1 ? "" : "s"} selected
                        </p>
                    </div>
                    <Button size="icon-sm" onClick={() => setGenerateOpen(true)}>
                        <FilePlus2Icon />
                        <span className="sr-only">Create output</span>
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {isLoading ? (
                    <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-24" />)}</div>
                ) : error ? (
                    <p role="alert" className="text-sm text-destructive">Could not load outputs.</p>
                ) : artifacts.length === 0 ? (
                    <div className="grid place-items-center gap-3 py-12 text-center">
                        <GraduationCapIcon className="size-7 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium">Your desk is clear</p>
                            <p className="mt-1 text-xs text-muted-foreground">Turn notebook sources into a study output.</p>
                        </div>
                        <Button size="sm" onClick={() => setGenerateOpen(true)}>Create output</Button>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {artifacts.map((artifact) => (
                            <li key={artifact.id}>
                                <Link
                                    href={learnRoutes.detail(workspaceId, artifact.id)}
                                    className="paper-sheet block rounded-md border-t-4 border-t-sticky-blue p-3 transition-colors hover:bg-muted/20"
                                >
                                    <div className="flex flex-wrap gap-1.5">
                                        <ArtifactTypeBadge type={artifact.type} />
                                        <ArtifactStatusBadge status={artifact.status} />
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-sm font-medium">{artifact.title}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{ARTIFACT_TYPE_LABELS[artifact.type]}</p>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <GenerateArtifactDialog workspaceId={workspaceId} open={generateOpen} onOpenChange={setGenerateOpen} />
        </section>
    );
}
