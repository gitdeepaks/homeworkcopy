/**
 * The memory settings page, behind the consent that governs the provider.
 *
 * Every function here goes through {@link assertMemoryConsent} first. The
 * disclosure tells a reader that with learned memory off, nothing about them
 * reaches the memory provider — so a hand-written memory still being stored
 * there would make the published statement false. One gate, applied to every
 * path, is what keeps the page and the product in agreement.
 *
 * Reading is deliberately not gated: someone who has just turned memory off
 * still needs to see what is stored so they can delete it, and refusing to show
 * it would be a strange way to honour the choice.
 */

import {
    addUserMemory,
    deleteUserMemory,
    listUserMemories,
    updateUserMemory,
} from "../lib/mem0.js";
import { ForbiddenError } from "../types/app-error.js";
import { resolvePrivacyPreferences } from "./privacy.service.js";

/**
 * Refuses a write when the reader has not consented to the memory provider.
 *
 * @param userId - Authenticated user's id
 * @throws {ForbiddenError} When memory is turned off in privacy settings
 */
async function assertMemoryConsent(userId: string): Promise<void> {
    const { learnedMemory } = await resolvePrivacyPreferences(userId);
    if (!learnedMemory) {
        throw new ForbiddenError(
            "Memory is turned off in your privacy settings. Turn it on to save memories.",
        );
    }
}

/**
 * Lists a reader's stored memories.
 *
 * Not gated on consent: a reader who has just turned memory off needs to see
 * what is still stored in order to remove it.
 *
 * @param userId - Owner of the memories
 * @returns The stored memories, or `[]` when no provider is configured
 */
export function listMemoriesForUser(userId: string) {
    return listUserMemories(userId);
}

/**
 * Creates a user-authored memory.
 *
 * @param userId - Owner of the memory
 * @param input - Raw memory text from the client
 * @returns Created memory record
 * @throws {ForbiddenError} When memory is turned off in privacy settings
 */
export async function createMemoryForUser(
    userId: string,
    input: { memory: string },
) {
    await assertMemoryConsent(userId);
    return addUserMemory(userId, {
        memory: input.memory,
        infer: false,
        metadata: { source: "manual" },
    });
}

/**
 * Updates the text of an existing memory.
 *
 * @param userId - Owner of the memory
 * @param memoryId - Memory to update
 * @param input - New memory text
 * @returns Updated memory record
 * @throws {ForbiddenError} When memory is turned off in privacy settings
 * @throws {NotFoundError} When the memory belongs to someone else
 */
export async function updateMemoryForUser(
    userId: string,
    memoryId: string,
    input: { memory: string },
) {
    await assertMemoryConsent(userId);
    return updateUserMemory(userId, memoryId, input);
}

/**
 * Deletes a memory.
 *
 * Not gated on consent, for the same reason reading is not: removing data must
 * never be harder than storing it was.
 *
 * @param userId - Owner of the memory
 * @param memoryId - Memory to delete
 * @returns Resolves when the memory is gone
 * @throws {NotFoundError} When the memory belongs to someone else
 */
export function deleteMemoryForUser(userId: string, memoryId: string) {
    return deleteUserMemory(userId, memoryId);
}
