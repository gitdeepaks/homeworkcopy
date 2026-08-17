import { z } from "zod";
import {
    createNoteRequestSchema,
    updateNoteRequestSchema,
} from "@homeworkcopy/contracts";
import { workspaceIdParamSchema } from "./workspace.validator.js";

export const noteIdParamSchema = workspaceIdParamSchema.extend({
    noteId: z.string().trim().min(1, "Note id is required"),
});

export const createNoteSchema = createNoteRequestSchema;
export const updateNoteSchema = updateNoteRequestSchema;

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
