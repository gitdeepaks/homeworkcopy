import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const noteSelect = {
    id: true,
    workspaceId: true,
    title: true,
    content: true,
    origin: true,
    sourceIds: true,
    citations: true,
    savedFrom: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type NoteRecord = Prisma.NoteGetPayload<{
    select: typeof noteSelect;
}>;

export type CreateNoteData = {
    workspaceId: string;
    title: string;
    content: string;
    origin: NoteRecord["origin"];
    sourceIds: string[];
    citations?: Prisma.InputJsonValue;
    savedFrom?: Prisma.InputJsonValue;
};

export type UpdateNoteData = {
    title?: string;
    content?: string;
    sourceIds?: string[];
    /**
     * A complete replacement envelope, empty when the reader removed every
     * citation. Never `null`: the service always writes a versioned envelope so
     * readers do not have to distinguish "no citations" from "never set".
     */
    citations?: Prisma.InputJsonValue;
};

export function findNotesByWorkspaceId(workspaceId: string) {
    return prisma.note.findMany({
        where: { workspaceId },
        select: noteSelect,
        orderBy: { updatedAt: "desc" },
    });
}

export function findNoteByIdAndWorkspaceId(
    noteId: string,
    workspaceId: string,
) {
    return prisma.note.findFirst({
        where: { id: noteId, workspaceId },
        select: noteSelect,
    });
}

export function createNoteRecord(data: CreateNoteData) {
    return prisma.note.create({
        data: {
            workspaceId: data.workspaceId,
            title: data.title,
            content: data.content,
            origin: data.origin,
            sourceIds: data.sourceIds,
            citations: data.citations,
            savedFrom: data.savedFrom,
        },
        select: noteSelect,
    });
}

export function updateNoteRecord(noteId: string, data: UpdateNoteData) {
    return prisma.note.update({
        where: { id: noteId },
        data: {
            ...(data.title === undefined ? {} : { title: data.title }),
            ...(data.content === undefined ? {} : { content: data.content }),
            ...(data.sourceIds === undefined
                ? {}
                : { sourceIds: data.sourceIds }),
            ...(data.citations === undefined
                ? {}
                : { citations: data.citations }),
        },
        select: noteSelect,
    });
}

export async function deleteNoteRecord(noteId: string) {
    await prisma.note.delete({ where: { id: noteId } });
}
