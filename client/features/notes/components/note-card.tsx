"use client";

import { useState } from "react";
import {
    DownloadIcon,
    MessageSquareIcon,
    MoreVerticalIcon,
    PencilIcon,
    SparklesIcon,
    Trash2Icon,
} from "lucide-react";
import { readNoteCitations, type Note } from "@homeworkcopy/contracts";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotebookCan } from "@/features/collaboration";
import { useDeleteNote } from "../hooks/use-notes";
import { noteFileName, noteToMarkdown } from "../lib/export";
import { CitedSourceList } from "./cited-source-list";
import { NoteEditorDialog } from "./note-editor-dialog";

type NoteCardProps = {
    note: Note;
};

function downloadMarkdown(note: Note) {
    const blob = new Blob([noteToMarkdown(note, readNoteCitations(note.citations))], {
        type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = noteFileName(note);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/** Icon and label describing where a note came from. */
function originBadge(note: Note) {
    switch (note.origin) {
        case "CHAT":
            return { Icon: MessageSquareIcon, label: "From a chat answer" };
        case "OUTPUT":
            return { Icon: SparklesIcon, label: "From an output" };
        case "MANUAL":
            return { Icon: PencilIcon, label: "Written by hand" };
    }
}

/**
 * One note, with its origin, its citations, and the actions that manage it.
 *
 * The body is rendered as plain text rather than Markdown: a note is short and
 * the reader wrote it, so showing exactly what they typed matters more than
 * formatting it.
 */
export function NoteCard({ note }: NoteCardProps) {
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const deleteNote = useDeleteNote(note.workspaceId);
    const canEdit = useNotebookCan("note:update");
    const canDelete = useNotebookCan("note:delete");
    const citations = readNoteCitations(note.citations);
    const { Icon, label } = originBadge(note);

    async function handleDelete() {
        try {
            await deleteNote.mutateAsync(note.id);
        } catch {
            return;
        }
        setDeleteOpen(false);
    }

    return (
        <article className="rounded-2xl border bg-paper p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h4 className="truncate font-heading text-base font-bold">
                        {note.title}
                    </h4>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Icon aria-hidden className="size-3" />
                        {label}
                    </p>
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${note.title}`}
                            />
                        }
                    >
                        <MoreVerticalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        {canEdit ? (
                            <DropdownMenuItem onClick={() => setEditOpen(true)}>
                                <PencilIcon />
                                Edit
                            </DropdownMenuItem>
                        ) : null}
                        {/* Exporting is a re-rendering of what the reader can
                            already see, so it stays available at every role. */}
                        <DropdownMenuItem onClick={() => downloadMarkdown(note)}>
                            <DownloadIcon />
                            Export Markdown
                        </DropdownMenuItem>
                        {canDelete ? (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => setDeleteOpen(true)}
                                >
                                    <Trash2Icon />
                                    Delete
                                </DropdownMenuItem>
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <p className="mt-2 line-clamp-6 text-sm whitespace-pre-wrap">
                {note.content}
            </p>

            <CitedSourceList
                workspaceId={note.workspaceId}
                citations={citations}
            />

            {deleteNote.error ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                    {deleteNote.error.message}
                </p>
            ) : null}

            <NoteEditorDialog
                workspaceId={note.workspaceId}
                open={editOpen}
                onOpenChange={setEditOpen}
                note={note}
            />

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete “{note.title}”?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This removes the note from your notebook. Your sources
                            and outputs are not affected. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep note</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={deleteNote.isPending}
                            onClick={() => void handleDelete()}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </article>
    );
}
