import { Router } from "express";
import {
    createNote,
    deleteNote,
    getNote,
    listNotes,
    updateNote,
} from "../controllers/note.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const noteRoutes = Router({ mergeParams: true });

noteRoutes.get("/", asyncHandler(listNotes));
noteRoutes.post("/", asyncHandler(createNote));
noteRoutes.get("/:noteId", asyncHandler(getNote));
noteRoutes.patch("/:noteId", asyncHandler(updateNote));
noteRoutes.delete("/:noteId", asyncHandler(deleteNote));
