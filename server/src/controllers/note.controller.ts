import type { Request, Response } from "express";
import {
    createNoteForWorkspace,
    deleteNoteForWorkspace,
    getNoteForWorkspace,
    listNotesForWorkspace,
    updateNoteForWorkspace,
} from "../services/note.service.js";
import {
    createNoteSchema,
    noteIdParamSchema,
    updateNoteSchema,
} from "../validators/note.validator.js";
import { workspaceIdParamSchema } from "../validators/workspace.validator.js";
import { actorOf } from "../utils/actor.js";

export async function listNotes(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const notes = await listNotesForWorkspace(workspaceId, req.session.user.id);
    res.json(notes);
}

export async function getNote(req: Request, res: Response) {
    const { workspaceId, noteId } = noteIdParamSchema.parse(req.params);
    const note = await getNoteForWorkspace(
        workspaceId,
        noteId,
        req.session.user.id,
    );
    res.json(note);
}

export async function createNote(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const input = createNoteSchema.parse(req.body);
    const note = await createNoteForWorkspace(
        workspaceId,
        req.session.user.id,
        input,
    );
    res.status(201).json(note);
}

export async function updateNote(req: Request, res: Response) {
    const { workspaceId, noteId } = noteIdParamSchema.parse(req.params);
    const input = updateNoteSchema.parse(req.body);
    const note = await updateNoteForWorkspace(
        workspaceId,
        noteId,
        req.session.user.id,
        input,
    );
    res.json(note);
}

export async function deleteNote(req: Request, res: Response) {
    const { workspaceId, noteId } = noteIdParamSchema.parse(req.params);
    await deleteNoteForWorkspace(workspaceId, noteId, actorOf(req));
    res.status(204).send();
}
