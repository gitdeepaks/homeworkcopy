"use client";

import { useState } from "react";
import { NotebookPenIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotebookCan } from "@/features/collaboration";
import { useNotes } from "../hooks/use-notes";
import { NoteCard } from "./note-card";
import { NoteEditorDialog } from "./note-editor-dialog";

type NotesListProps = {
    workspaceId: string;
};

/**
 * Every note in a notebook, newest edit first.
 *
 * The empty state says plainly that notes do not affect grounding, because that
 * is the first thing a reader wonders when a notebook gains a second kind of
 * text.
 */
export function NotesList({ workspaceId }: NotesListProps) {
    const [createOpen, setCreateOpen] = useState(false);
    const canWriteNotes = useNotebookCan("note:create");
    const { data: notes = [], isLoading, error } = useNotes(workspaceId);

    return (
        <div>
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    {notes.length} note{notes.length === 1 ? "" : "s"}
                </p>
                {canWriteNotes ? (
                    <Button
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => setCreateOpen(true)}
                    >
                        <PlusIcon />
                        New note
                    </Button>
                ) : null}
            </div>

            {isLoading ? (
                <div className="mt-3 space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-24" />
                    ))}
                </div>
            ) : error ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                    Could not load notes.
                </p>
            ) : notes.length === 0 ? (
                <div className="mt-3 grid place-items-center gap-3 py-10 text-center">
                    <NotebookPenIcon className="size-7 text-muted-foreground" />
                    <div>
                        <p className="text-sm font-medium">No notes yet</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Write one, or save an excerpt from a chat answer or an
                            output. Notes never change what your answers are
                            grounded in.
                        </p>
                    </div>
                    {canWriteNotes ? (
                        <Button
                            size="sm"
                            className="min-h-11"
                            onClick={() => setCreateOpen(true)}
                        >
                            Write a note
                        </Button>
                    ) : null}
                </div>
            ) : (
                <ul className="mt-3 space-y-3">
                    {notes.map((note) => (
                        <li key={note.id}>
                            <NoteCard note={note} />
                        </li>
                    ))}
                </ul>
            )}

            {canWriteNotes ? (
                <NoteEditorDialog
                    workspaceId={workspaceId}
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                />
            ) : null}
        </div>
    );
}
