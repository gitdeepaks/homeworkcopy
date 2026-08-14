"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useSources } from "@/features/sources";
import {
    ARTIFACT_TYPE_DESCRIPTIONS,
    ARTIFACT_TYPE_LABELS,
    ARTIFACT_TYPES,
} from "../lib/constants";
import { useCreateArtifact } from "../hooks/use-artifacts";
import type { ArtifactType } from "../lib/types";
import { useNotebookUiStore } from "@/features/workspaces/stores/notebook-ui-store";
import { resolveSourceSelection } from "@/features/sources/lib/grounding";

type GenerateArtifactDialogProps = {
    workspaceId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const EMPTY_SOURCE_IDS: string[] = [];

export function GenerateArtifactDialog({
    workspaceId,
    open,
    onOpenChange,
}: GenerateArtifactDialogProps) {
    const [type, setType] = useState<ArtifactType>("SUMMARY");
    const [title, setTitle] = useState("");
    const createArtifact = useCreateArtifact(workspaceId);
    const {
        data: sources = [],
        isLoading: sourcesLoading,
        error: sourcesError,
    } = useSources(workspaceId);
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
    const readySourceCount = sources.filter(
        (source) => source.status === "READY",
    ).length;
    const processingSourceCount = sources.filter(
        (source) =>
            source.status === "PENDING" || source.status === "PROCESSING",
    ).length;
    const canGenerate =
        !sourcesLoading && !sourcesError && selection.canUseSelection;

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();

        if (!canGenerate) {
            return;
        }

        try {
            await createArtifact.mutateAsync({
                type,
                title: title.trim() || undefined,
                ...selection.request,
            });
        } catch {
            return;
        }

        setTitle("");
        onOpenChange(false);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <form onSubmit={(event) => void handleSubmit(event)}>
                    <DialogHeader>
                        <DialogTitle>Create output</DialogTitle>
                        <DialogDescription>
                            Uses exactly the source selection shown in this
                            notebook. Generation continues in the background.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        {sourcesLoading ? (
                            <div
                                role="status"
                                className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
                            >
                                <Spinner />
                                Checking source readiness...
                            </div>
                        ) : sourcesError ? (
                            <p
                                role="alert"
                                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                            >
                                Could not verify source readiness. Close this
                                dialog and try again.
                            </p>
                        ) : selection.exceedsSourceLimit ? (
                            <p
                                role="alert"
                                className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm"
                            >
                                Choose at most 50 sources before creating an
                                output.
                            </p>
                        ) : selection.unavailableSourceIds.length > 0 ? (
                            <p
                                role="alert"
                                className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm"
                            >
                                One or more selected sources are unavailable.
                                Update the selection in Sources before creating
                                an output.
                            </p>
                        ) : readySourceCount === 0 ? (
                            <p
                                role="status"
                                className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm"
                            >
                                {processingSourceCount > 0
                                    ? `${processingSourceCount} source${processingSourceCount === 1 ? " is" : "s are"} still processing. You can create an output when at least one source is ready.`
                                    : "Add and process at least one source before creating an output."}
                            </p>
                        ) : selection.effectiveSourceIds.length === 0 ? (
                            <p
                                role="status"
                                className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-sm"
                            >
                                Select at least one ready source before creating
                                an output.
                            </p>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {selection.effectiveSourceIds.length} selected source
                                {selection.effectiveSourceIds.length === 1 ? "" : "s"} will be
                                used.
                            </p>
                        )}

                        {createArtifact.error ? (
                            <p
                                role="alert"
                                className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                            >
                                {createArtifact.error.message}
                            </p>
                        ) : null}

                        <div className="grid gap-2">
                            <Label htmlFor="artifact-type">Type</Label>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {ARTIFACT_TYPES.map((artifactType) => (
                                    <button
                                        key={artifactType}
                                        type="button"
                                        onClick={() => setType(artifactType)}
                                        disabled={!canGenerate}
                                        className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                                            type === artifactType
                                                ? "border-primary bg-primary/10"
                                                : "hover:bg-muted/50"
                                        }`}
                                    >
                                        <p className="text-sm font-medium">
                                            {
                                                ARTIFACT_TYPE_LABELS[
                                                    artifactType
                                                ]
                                            }
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                            {
                                                ARTIFACT_TYPE_DESCRIPTIONS[
                                                    artifactType
                                                ]
                                            }
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="artifact-title">
                                Title (optional)
                            </Label>
                            <Input
                                id="artifact-title"
                                value={title}
                                onChange={(event) =>
                                    setTitle(event.target.value)
                                }
                                placeholder="Custom title"
                                disabled={!canGenerate}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={createArtifact.isPending || !canGenerate}
                        >
                            {createArtifact.isPending ? <Spinner /> : null}
                            Generate
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
