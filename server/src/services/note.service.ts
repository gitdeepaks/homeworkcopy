/**
 * Notebook notes: the reader's own writing, captured by hand or saved from a
 * chat answer or a Studio output.
 *
 * Notes are deliberately outside the grounding path. They are never chunked,
 * embedded, or indexed, so adding one can never change what a grounded answer is
 * built from — see `NOTES_PARTICIPATE_IN_GROUNDING` in the contracts package for
 * why, and what adopting them as a source class would require.
 *
 * Every citation is checked against the notebook before it is stored, so a note
 * can only ever point at a source the reader already owns.
 */

import {
    noteCitationEnvelopeSchema,
    NOTE_CITATIONS_VERSION,
    NOTE_TITLE_MAX_LENGTH,
    type CreateNoteRequest,
    type NoteCitation,
    type NoteCitationEnvelope,
    type NoteCitationInput,
    type NoteSavedFrom,
    type UpdateNoteRequest,
} from "@homeworkcopy/contracts";
import { findArtifactByIdAndWorkspaceId } from "../repositories/artifact.repository.js";
import { findConversationByIdAndWorkspaceId } from "../repositories/conversation.repository.js";
import {
    createNoteRecord,
    deleteNoteRecord,
    findNoteByIdAndWorkspaceId,
    findNotesByWorkspaceId,
    updateNoteRecord,
    type NoteRecord,
} from "../repositories/note.repository.js";
import { findSourcesByIdsAndWorkspaceId } from "../repositories/source.repository.js";
import { NotFoundError, ValidationError } from "../types/app-error.js";
import { toPrismaJson } from "../utils/prisma-json.js";
import { getWorkspaceByIdForUser } from "./workspace.service.js";

/**
 * Derives a title from the note body when the reader did not supply one.
 *
 * The first non-empty line wins, with any Markdown heading marker stripped, so a
 * note that opens with `## Entropy` is titled `Entropy` rather than `## Entropy`.
 *
 * @param content - Note body
 * @returns The first line, trimmed to the title limit
 */
export function deriveTitle(content: string): string {
    const firstLine = content
        .split("\n")
        .map((line) => line.replace(/^#+\s*/, "").trim())
        .find((line) => line.length > 0);

    return (firstLine ?? "Untitled note").slice(0, NOTE_TITLE_MAX_LENGTH);
}

/**
 * Resolves submitted citations against the notebook's own sources.
 *
 * This is both the ownership check and the reason a client never sends a
 * source's type or title: each citation is completed from the source record, so
 * a note can only describe a source the reader actually owns, and always
 * describes it accurately.
 *
 * @param workspaceId - Notebook the note belongs to
 * @param citations - Citations submitted by the client
 * @returns A versioned envelope and the unique source ids it references
 * @throws {ValidationError} When a citation points outside the notebook
 */
async function resolveCitations(
    workspaceId: string,
    citations: readonly NoteCitationInput[],
): Promise<{ envelope: NoteCitationEnvelope; sourceIds: string[] }> {
    const sourceIds = [
        ...new Set(citations.map((citation) => citation.sourceId)),
    ];

    if (sourceIds.length === 0) {
        return {
            envelope: { version: NOTE_CITATIONS_VERSION, items: [] },
            sourceIds,
        };
    }

    const sources = await findSourcesByIdsAndWorkspaceId(
        sourceIds,
        workspaceId,
    );
    const byId = new Map(sources.map((source) => [source.id, source]));

    if (byId.size !== sourceIds.length) {
        throw new ValidationError(
            "A citation refers to a source that is not in this notebook",
        );
    }

    const items: NoteCitation[] = citations.map((citation) => {
        const source = byId.get(citation.sourceId);
        if (!source) {
            throw new ValidationError(
                "A citation refers to a source that is not in this notebook",
            );
        }
        return {
            ...citation,
            sourceType: source.type,
            title: source.title,
        };
    });

    const envelope = noteCitationEnvelopeSchema.safeParse({
        version: NOTE_CITATIONS_VERSION,
        items,
    });
    if (!envelope.success) {
        throw new ValidationError(
            "The same source location cannot be cited twice in one note",
        );
    }

    return { envelope: envelope.data, sourceIds };
}

/**
 * Verifies that a saved-from pointer refers to something in this notebook.
 *
 * @param workspaceId - Notebook the note belongs to
 * @param savedFrom - Origin pointer submitted by the client
 * @throws {ValidationError} When the origin is not in this notebook
 */
async function assertSavedFromOwned(
    workspaceId: string,
    savedFrom: NoteSavedFrom,
): Promise<void> {
    if (savedFrom.kind === "chat") {
        const conversation = await findConversationByIdAndWorkspaceId(
            savedFrom.conversationId,
            workspaceId,
        );
        if (!conversation) {
            throw new ValidationError(
                "That conversation is not in this notebook",
            );
        }
        return;
    }

    const output = await findArtifactByIdAndWorkspaceId(
        savedFrom.outputId,
        workspaceId,
    );
    if (!output) {
        throw new ValidationError("That output is not in this notebook");
    }
}

/**
 * Lists every note in a notebook, most recently updated first.
 *
 * @param workspaceId - Notebook to list notes from
 * @param userId - Authenticated user's id
 * @returns Note records
 */
export async function listNotesForWorkspace(
    workspaceId: string,
    userId: string,
): Promise<NoteRecord[]> {
    await getWorkspaceByIdForUser(workspaceId, userId);
    return findNotesByWorkspaceId(workspaceId);
}

/**
 * Loads a single note after verifying notebook ownership.
 *
 * @param workspaceId - Notebook the note belongs to
 * @param noteId - Note to fetch
 * @param userId - Authenticated user's id
 * @returns The note record
 * @throws {NotFoundError} When the note does not exist in this notebook
 */
export async function getNoteForWorkspace(
    workspaceId: string,
    noteId: string,
    userId: string,
): Promise<NoteRecord> {
    await getWorkspaceByIdForUser(workspaceId, userId);

    const note = await findNoteByIdAndWorkspaceId(noteId, workspaceId);
    if (!note) {
        throw new NotFoundError("Note not found");
    }

    return note;
}

/**
 * Creates a note, whether written by hand or saved from an excerpt.
 *
 * @param workspaceId - Notebook to attach the note to
 * @param userId - Authenticated user's id
 * @param input - Body, optional title, origin, citations, and origin pointer
 * @returns The new note
 * @throws {ValidationError} When a citation or origin points outside the notebook
 */
export async function createNoteForWorkspace(
    workspaceId: string,
    userId: string,
    input: CreateNoteRequest,
): Promise<NoteRecord> {
    await getWorkspaceByIdForUser(workspaceId, userId);

    if (input.savedFrom) {
        await assertSavedFromOwned(workspaceId, input.savedFrom);
    }

    const { envelope, sourceIds } = await resolveCitations(
        workspaceId,
        input.citations ?? [],
    );

    return createNoteRecord({
        workspaceId,
        title: input.title ?? deriveTitle(input.content),
        content: input.content,
        origin: input.origin,
        sourceIds,
        citations: toPrismaJson(envelope),
        ...(input.savedFrom
            ? { savedFrom: toPrismaJson(input.savedFrom) }
            : {}),
    });
}

/**
 * Updates a note's title, body, or citations.
 *
 * Origin and saved-from stay fixed: they record where the note came from, which
 * editing it does not change.
 *
 * @param workspaceId - Notebook the note belongs to
 * @param noteId - Note to update
 * @param userId - Authenticated user's id
 * @param input - Fields to change
 * @returns The updated note
 * @throws {ValidationError} When a citation points outside the notebook
 */
export async function updateNoteForWorkspace(
    workspaceId: string,
    noteId: string,
    userId: string,
    input: UpdateNoteRequest,
): Promise<NoteRecord> {
    await getNoteForWorkspace(workspaceId, noteId, userId);

    if (input.citations === undefined) {
        return updateNoteRecord(noteId, {
            ...(input.title === undefined ? {} : { title: input.title }),
            ...(input.content === undefined ? {} : { content: input.content }),
        });
    }

    const { envelope, sourceIds } = await resolveCitations(
        workspaceId,
        input.citations,
    );

    return updateNoteRecord(noteId, {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.content === undefined ? {} : { content: input.content }),
        sourceIds,
        citations: toPrismaJson(envelope),
    });
}

/**
 * Deletes a note.
 *
 * A note owns no vectors or stored objects, so removal is a single row delete
 * with nothing left to reconcile.
 *
 * @param workspaceId - Notebook the note belongs to
 * @param noteId - Note to delete
 * @param userId - Authenticated user's id
 * @returns Resolves when the row is deleted
 * @throws {NotFoundError} When the note is not found
 */
export async function deleteNoteForWorkspace(
    workspaceId: string,
    noteId: string,
    userId: string,
): Promise<void> {
    await getNoteForWorkspace(workspaceId, noteId, userId);
    await deleteNoteRecord(noteId);
}

export type { NoteRecord };
