import {
    noteSchema,
    type CreateNoteRequestInput,
    type UpdateNoteRequest,
} from "@homeworkcopy/contracts";
import { z } from "zod";
import { apiFetchVoid, apiFetchWithSchema } from "@/shared/lib/api";

function notesPath(workspaceId: string) {
    return `/api/workspaces/${workspaceId}/notes`;
}

export function listNotes(workspaceId: string) {
    return apiFetchWithSchema(notesPath(workspaceId), z.array(noteSchema));
}

export function getNote(workspaceId: string, noteId: string) {
    return apiFetchWithSchema(
        `${notesPath(workspaceId)}/${noteId}`,
        noteSchema,
    );
}

export function createNote(
    workspaceId: string,
    input: CreateNoteRequestInput,
) {
    return apiFetchWithSchema(notesPath(workspaceId), noteSchema, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function updateNote(
    workspaceId: string,
    noteId: string,
    input: UpdateNoteRequest,
) {
    return apiFetchWithSchema(
        `${notesPath(workspaceId)}/${noteId}`,
        noteSchema,
        { method: "PATCH", body: JSON.stringify(input) },
    );
}

export function deleteNote(workspaceId: string, noteId: string) {
    return apiFetchVoid(`${notesPath(workspaceId)}/${noteId}`, {
        method: "DELETE",
    });
}
