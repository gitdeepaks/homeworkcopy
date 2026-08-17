"use client";

import { useState } from "react";
import { GraduationCapIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotesList } from "@/features/notes";
import { useOutputs } from "../hooks/use-outputs";
import { OUTPUT_GROUP_LABELS } from "../lib/constants";
import { groupOutputs } from "../lib/grouping";
import { CreateOutputDialog } from "./create-output-dialog";
import { OutputCard } from "./output-card";

type StudioHubProps = {
    workspaceId: string;
};

/** Full-page Studio, used by the direct-link `/studio` route. */
export function StudioHub({ workspaceId }: StudioHubProps) {
    const [createOpen, setCreateOpen] = useState(false);
    const { data: outputs = [], isLoading, error } = useOutputs(workspaceId);
    const shelves = groupOutputs(outputs);

    return (
        <div className="flex flex-1 flex-col gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <GraduationCapIcon className="size-5" />
                        <h2 className="font-heading text-xl font-semibold">
                            Studio
                        </h2>
                    </div>
                    <p className="max-w-xl text-sm text-muted-foreground">
                        Turn the sources you selected into study guides,
                        flashcards, quizzes, mind maps, briefings, and more.
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)}>
                    <PlusIcon />
                    Create output
                </Button>
            </div>

            {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Skeleton className="h-32 rounded-3xl" />
                    <Skeleton className="h-32 rounded-3xl" />
                    <Skeleton className="h-32 rounded-3xl" />
                </div>
            ) : error ? (
                <div
                    role="alert"
                    className="rounded-2xl border border-dashed p-8 text-center text-sm text-destructive"
                >
                    Could not load outputs.
                </div>
            ) : outputs.length === 0 ? (
                <div className="rounded-2xl border border-dashed p-10 text-center">
                    <p className="font-medium">No outputs yet</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Generate your first study guide, quiz, or flashcard deck
                        from the notebook sources you selected.
                    </p>
                    <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                        <PlusIcon />
                        Create output
                    </Button>
                </div>
            ) : (
                <div className="space-y-8">
                    {shelves.map((shelf) => (
                        <section
                            key={shelf.group}
                            aria-labelledby={`studio-hub-shelf-${shelf.group}`}
                        >
                            <h3
                                id={`studio-hub-shelf-${shelf.group}`}
                                className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
                            >
                                {OUTPUT_GROUP_LABELS[shelf.group]}
                            </h3>
                            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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

            <section aria-labelledby="studio-hub-notes" className="border-t pt-6">
                <h3
                    id="studio-hub-notes"
                    className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
                >
                    Notes
                </h3>
                <NotesList workspaceId={workspaceId} />
            </section>

            <CreateOutputDialog
                workspaceId={workspaceId}
                open={createOpen}
                onOpenChange={setCreateOpen}
            />
        </div>
    );
}
