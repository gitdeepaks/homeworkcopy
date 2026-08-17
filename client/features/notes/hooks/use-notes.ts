"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
    CreateNoteRequestInput,
    UpdateNoteRequest,
} from "@homeworkcopy/contracts";
import {
    createNote,
    deleteNote,
    listNotes,
    updateNote,
} from "../lib/api";

export function noteKeys(workspaceId: string) {
    return {
        all: ["notes", workspaceId] as const,
        list: () => ["notes", workspaceId, "list"] as const,
        detail: (noteId: string) => ["notes", workspaceId, noteId] as const,
    };
}

export function useNotes(workspaceId: string) {
    return useQuery({
        queryKey: noteKeys(workspaceId).list(),
        queryFn: () => listNotes(workspaceId),
    });
}

export function useCreateNote(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: CreateNoteRequestInput) =>
            createNote(workspaceId, input),
        onSuccess: () => {
            void queryClient.invalidateQueries({
                queryKey: noteKeys(workspaceId).all,
            });
        },
    });
}

export function useUpdateNote(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            noteId,
            input,
        }: {
            noteId: string;
            input: UpdateNoteRequest;
        }) => updateNote(workspaceId, noteId, input),
        onSuccess: (note) => {
            queryClient.setQueryData(
                noteKeys(workspaceId).detail(note.id),
                note,
            );
            void queryClient.invalidateQueries({
                queryKey: noteKeys(workspaceId).all,
            });
        },
    });
}

export function useDeleteNote(workspaceId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (noteId: string) => deleteNote(workspaceId, noteId),
        onSuccess: (_result, noteId) => {
            queryClient.removeQueries({
                queryKey: noteKeys(workspaceId).detail(noteId),
            });
            void queryClient.invalidateQueries({
                queryKey: noteKeys(workspaceId).all,
            });
        },
    });
}
