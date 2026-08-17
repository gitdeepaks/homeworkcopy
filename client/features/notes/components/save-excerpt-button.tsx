"use client";

import { useState } from "react";
import { CheckIcon, NotebookPenIcon } from "lucide-react";
import type { NoteOrigin, NoteSavedFrom } from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import {
    NoteEditorDialog,
    type NoteDraft,
    type NoteDraftCitation,
} from "./note-editor-dialog";

type SaveExcerptButtonProps = {
    workspaceId: string;
    /** Text to seed the note with, e.g. a chat answer or an output excerpt. */
    content: string;
    origin: NoteOrigin;
    savedFrom: NoteSavedFrom;
    /** Locations in the notebook's sources that support this excerpt. */
    citations: readonly NoteDraftCitation[];
    /** Rendered as an icon-only control, for a dense message toolbar. */
    compact?: boolean;
};

/**
 * Saves a chat answer or an output excerpt into a note.
 *
 * The dialog opens prefilled rather than saving straight away, so the reader
 * decides what the note actually says before it lands in their notebook. The
 * citations travel with it, so the note stays verifiable.
 */
export function SaveExcerptButton({
    workspaceId,
    content,
    origin,
    savedFrom,
    citations,
    compact = false,
}: SaveExcerptButtonProps) {
    const [open, setOpen] = useState(false);
    const [saved, setSaved] = useState(false);

    const draft: NoteDraft = { content, origin, citations, savedFrom };

    return (
        <>
            {compact ? (
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Save answer as a note"
                    onClick={() => setOpen(true)}
                >
                    {saved ? <CheckIcon /> : <NotebookPenIcon />}
                </Button>
            ) : (
                <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                    {saved ? <CheckIcon /> : <NotebookPenIcon />}
                    {saved ? "Saved to notes" : "Save as note"}
                </Button>
            )}

            <NoteEditorDialog
                workspaceId={workspaceId}
                open={open}
                onOpenChange={setOpen}
                draft={draft}
                onSaved={() => setSaved(true)}
            />
        </>
    );
}
