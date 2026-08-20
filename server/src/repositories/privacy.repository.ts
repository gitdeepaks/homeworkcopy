import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

export const privacySettingSelect = {
    userId: true,
    learnedMemoryEnabled: true,
    webSearchEnabled: true,
    updatedAt: true,
} as const;

export type PrivacySettingRecord = Prisma.UserPrivacySettingGetPayload<{
    select: typeof privacySettingSelect;
}>;

/**
 * Reads a user's stored preferences.
 *
 * @param userId - Authenticated user's id
 * @returns The row, or `null` when the reader has never changed anything
 */
export function findPrivacySettingByUserId(userId: string) {
    return prisma.userPrivacySetting.findUnique({
        where: { userId },
        select: privacySettingSelect,
    });
}

/**
 * Writes a user's preferences, creating the row on first change.
 *
 * The create branch supplies the same values as the update branch rather than
 * leaning on column defaults, so a first-ever change lands exactly what was
 * asked for instead of quietly keeping a default for the key that was omitted.
 *
 * @param userId - Authenticated user's id
 * @param values - Complete preference state to store
 * @returns The stored row
 */
export function upsertPrivacySetting(
    userId: string,
    values: { learnedMemoryEnabled: boolean; webSearchEnabled: boolean },
) {
    return prisma.userPrivacySetting.upsert({
        where: { userId },
        create: { userId, ...values },
        update: values,
        select: privacySettingSelect,
    });
}
