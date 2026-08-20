/**
 * Consent, and what it actually controls.
 *
 * A consent toggle is worth nothing unless the code path it names checks it, so
 * the important function in this file is {@link resolvePrivacyPreferences} and
 * the important property is that the two optional providers — web search and
 * learned memory — are unreachable without it returning `true`. The settings
 * page is the visible half; the guard at the provider boundary is the half that
 * makes the page true.
 *
 * Absence means off. An account that has never opened privacy settings has no
 * row, and a missing row reads as {@link DEFAULT_PRIVACY_PREFERENCES}, which
 * has both switches down. Nothing is opted in by having existed before this
 * phase shipped.
 */

import {
    activeDataProcessors,
    DEFAULT_PRIVACY_PREFERENCES,
    EXPORT_EXCLUSIONS,
    privacyPreferencesSchema,
    RETAINED_RESOURCES,
    RETENTION_POLICY,
    type PrivacyDisclosure,
    type PrivacyPreferences,
    type PrivacySettings,
    type UpdatePrivacyPreferences,
} from "@homeworkcopy/contracts";
import {
    findPrivacySettingByUserId,
    upsertPrivacySetting,
    type PrivacySettingRecord,
} from "../repositories/privacy.repository.js";

/**
 * Shapes a stored row as contract preferences.
 *
 * @param record - The stored row, or `null` when none exists
 * @returns The reader's preferences
 */
function toPreferences(
    record: PrivacySettingRecord | null,
): PrivacyPreferences {
    if (record === null) return DEFAULT_PRIVACY_PREFERENCES;
    return privacyPreferencesSchema.parse({
        learnedMemory: record.learnedMemoryEnabled,
        webSearch: record.webSearchEnabled,
    });
}

/**
 * The preferences every optional provider call is checked against.
 *
 * Read on each request rather than cached on the session, for the same reason
 * notebook membership is: withdrawing consent has to take effect on the next
 * call, not whenever a token happens to expire.
 *
 * @param userId - Authenticated user's id
 * @returns The reader's current preferences
 */
export async function resolvePrivacyPreferences(
    userId: string,
): Promise<PrivacyPreferences> {
    return toPreferences(await findPrivacySettingByUserId(userId));
}

/**
 * Reads preferences for the settings page.
 *
 * @param userId - Authenticated user's id
 * @returns Preferences and when they were last changed
 */
export async function getPrivacySettings(
    userId: string,
): Promise<PrivacySettings> {
    const record = await findPrivacySettingByUserId(userId);
    return {
        preferences: toPreferences(record),
        updatedAt: record === null ? null : record.updatedAt.toISOString(),
    };
}

/**
 * Applies a partial preference change.
 *
 * Read-modify-write rather than a partial update, so a client that sends one
 * key cannot have the other reset to a column default on first write.
 *
 * @param userId - Authenticated user's id
 * @param input - The keys being changed
 * @returns The full preference state after the change
 */
export async function updatePrivacyPreferences(
    userId: string,
    input: UpdatePrivacyPreferences,
): Promise<PrivacySettings> {
    const current = await resolvePrivacyPreferences(userId);
    const next = privacyPreferencesSchema.parse({
        learnedMemory: input.learnedMemory ?? current.learnedMemory,
        webSearch: input.webSearch ?? current.webSearch,
    });

    const record = await upsertPrivacySetting(userId, {
        learnedMemoryEnabled: next.learnedMemory,
        webSearchEnabled: next.webSearch,
    });

    return {
        preferences: toPreferences(record),
        updatedAt: record.updatedAt.toISOString(),
    };
}

/**
 * Builds the disclosure a reader sees.
 *
 * Only the processors their current choices actually admit are listed, so the
 * page answers "where does my data go?" rather than "where could anyone's data
 * go?" — the second is a legal notice, the first is an answer.
 *
 * @param userId - Authenticated user's id
 * @returns Active processors, current preferences, and the retention policy
 */
export async function getPrivacyDisclosure(
    userId: string,
): Promise<PrivacyDisclosure> {
    const preferences = await resolvePrivacyPreferences(userId);

    return {
        version: 1,
        processors: [...activeDataProcessors(preferences)],
        preferences,
        retention: RETAINED_RESOURCES.map((resource) => ({
            resource,
            summary: RETENTION_POLICY[resource].summary,
            retainedDays: RETENTION_POLICY[resource].retainedDays,
        })),
    };
}

/** What an export leaves out, published alongside the disclosure. */
export const EXPORT_EXCLUSION_NOTES: readonly string[] = EXPORT_EXCLUSIONS;
