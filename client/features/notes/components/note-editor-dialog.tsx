"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import {
    NOTE_CONTENT_MAX_LENGTH,
    NOTE_TITLE_MAX_LENGTH,
    readNoteCitations,
    type Note,
    type NoteCitationInput,
    type NoteOrigin,
    type NoteSavedFrom,
} from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useCreateNote, useUpdateNote } from "../hooks/use-notes";

/**
 * A citation being edited.
 *
 * `title` is display only — the server reads the authoritative title from the
 * source record, and the request schema drops this copy of it.
 */
export type NoteDraftCitation = NoteCitationInput & { title: string };

/** Everything a note can be seeded with when it is saved from an excerpt. */
export type NoteDraft = {
    title?: string;
    content: string;
    origin: NoteOrigin;
    citations: readonly NoteDraftCitation[];
    savedFrom?: NoteSavedFrom;
};

type NoteEditorDialogProps = {
    workspaceId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Set when editing an existing note. */
    note?: Note;
    /** Set when creating a note from an excerpt, or omitted for a blank note. */
    draft?: NoteDraft;
    onSaved?: (noteId: string) => void;
};

const BLANK_DRAFT: NoteDraft = {
    content: "",
    origin: "MANUAL",
    citations: [],
};

/**
 * Creates or edits a note.
 *
 * The form is remounted whenever the record or excerpt behind it changes, so a
 * reopened dialog always starts from what is actually being edited rather than
 * from whatever was last typed and abandoned.
 */
export function NoteEditorDialog({
    workspaceId,
    open,
    onOpenChange,
    note,
    draft,
    onSaved,
}: NoteEditorDialogProps) {
    const seed: NoteDraft = note
        ? {
              title: note.title,
              content: note.content,
              origin: note.origin,
              citations: readNoteCitations(note.citations),
          }
        : (draft ?? BLANK_DRAFT);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{note ? "Edit note" : "New note"}</DialogTitle>
                    <DialogDescription>
                        Notes are your own writing. They stay out of grounding, so
                        adding one never changes what your answers are built from.
                    </DialogDescription>
                </DialogHeader>

                {open ? (
                    <NoteEditorForm
                        key={`${note?.id ?? "new"}:${note?.updatedAt ?? seed.content.length.toString()}`}
                        workspaceId={workspaceId}
                        noteId={note?.id}
                        seed={seed}
                        onCancel={() => onOpenChange(false)}
                        onSaved={(noteId) => {
                            onSaved?.(noteId);
                            onOpenChange(false);
                        }}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

type NoteEditorFormProps = {
    workspaceId: string;
    noteId?: string | undefined;
    seed: NoteDraft;
    onCancel: () => void;
    onSaved: (noteId: string) => void;
};

/**
 * The note form itself.
 *
 * Citations can be removed but never typed in: they are captured from the place
 * the excerpt came from, so a reader cannot attach a source to a claim it does
 * not support.
 */
function NoteEditorForm({
    workspaceId,
    noteId,
    seed,
    onCancel,
    onSaved,
}: NoteEditorFormProps) {
    const [title, setTitle] = useState(seed.title ?? "");
    const [content, setContent] = useState(seed.content);
    const [citations, setCitations] = useState<readonly NoteDraftCitation[]>(
        seed.citations,
    );

    const createNote = useCreateNote(workspaceId);
    const updateNote = useUpdateNote(workspaceId);
    const pending = createNote.isPending || updateNote.isPending;
    const error = createNote.error ?? updateNote.error;

    async function handleSave() {
        const trimmed = content.trim();
        if (!trimmed) {
            return;
        }

        try {
            const saved = noteId
                ? await updateNote.mutateAsync({
                      noteId,
                      input: {
                          ...(title.trim() ? { title: title.trim() } : {}),
                          content: trimmed,
                          citations: [...citations],
                      },
                  })
                : await createNote.mutateAsync({
                      ...(title.trim() ? { title: title.trim() } : {}),
                      content: trimmed,
                      origin: seed.origin,
                      citations: [...citations],
                      ...(seed.savedFrom ? { savedFrom: seed.savedFrom } : {}),
                  });
            onSaved(saved.id);
        } catch {
            /* The error is surfaced from the mutation state below. */
        }
    }

    return (
        <>
            <div className="grid gap-4">
                {error ? (
                    <p
                        role="alert"
                        className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                    >
                        {error.message}
                    </p>
                ) : null}

                <div className="grid gap-2">
                    <Label htmlFor="note-title">Title (optional)</Label>
                    <Input
                        id="note-title"
                        value={title}
                        maxLength={NOTE_TITLE_MAX_LENGTH}
                        placeholder="Taken from the first line when left empty"
                        onChange={(event) => setTitle(event.target.value)}
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="note-content">Note</Label>
                    <Textarea
                        id="note-content"
                        rows={10}
                        value={content}
                        maxLength={NOTE_CONTENT_MAX_LENGTH}
                        placeholder="Write what you want to remember. Markdown is supported."
                        onChange={(event) => setContent(event.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        {content.length.toLocaleString()} /{" "}
                        {NOTE_CONTENT_MAX_LENGTH.toLocaleString()} characters
                    </p>
                </div>

                {citations.length > 0 ? (
                    <fieldset className="grid gap-2">
                        <legend className="text-sm font-medium">
                            Cited sources
                        </legend>
                        <ul className="grid gap-1.5">
                            {citations.map((citation, index) => (
                                <li
                                    key={`${citation.sourceId}-${String(index)}`}
                                    className="flex items-start gap-2 rounded-md border px-2 py-1.5"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">
                                            {citation.title}
                                        </p>
                                        {citation.excerpt ? (
                                            <p className="line-clamp-2 text-xs text-muted-foreground">
                                                “{citation.excerpt}”
                                            </p>
                                        ) : null}
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() =>
                                            setCitations((current) =>
                                                current.filter(
                                                    (_item, position) =>
                                                        position !== index,
                                                ),
                                            )
                                        }
                                    >
                                        <XIcon />
                                        <span className="sr-only">
                                            Remove citation to {citation.title}
                                        </span>
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </fieldset>
                ) : null}
            </div>

            <DialogFooter>
                <Button variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button
                    disabled={!content.trim() || pending}
                    onClick={() => void handleSave()}
                >
                    {pending ? <Spinner /> : null}
                    {noteId ? "Save note" : "Create note"}
                </Button>
            </DialogFooter>
        </>
    );
}
