import {
    dataExportSchema,
    deletionReceiptSchema,
    privacyDisclosureSchema,
    privacySettingsSchema,
    type CreateExportRequest,
    type DataExport,
    type DeletionReceipt,
    type PrivacyDisclosure,
    type PrivacySettings,
    type UpdatePrivacyPreferences,
} from "@homeworkcopy/contracts";
import { z } from "zod";
import { apiFetchWithSchema } from "@/shared/lib/api";
import { DELETE_ACCOUNT_CONFIRMATION } from "@homeworkcopy/contracts";

const exportListSchema = z.array(dataExportSchema);

/**
 * What deleting the account would destroy.
 *
 * Parsed rather than trusted so a shape change on the server surfaces here, at
 * the boundary, rather than as an undefined count rendered into a confirmation
 * screen.
 */
export const deletionPreviewSchema = z.object({
    notebooks: z.number().int().nonnegative(),
    sharedNotebooks: z.number().int().nonnegative(),
    collaboratorsLosingAccess: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
    conversations: z.number().int().nonnegative(),
    outputs: z.number().int().nonnegative(),
    notes: z.number().int().nonnegative(),
    notebooksSharedWithYou: z.number().int().nonnegative(),
});

export type DeletionPreview = z.infer<typeof deletionPreviewSchema>;

export function getPrivacySettings(): Promise<PrivacySettings> {
    return apiFetchWithSchema("/api/privacy/settings", privacySettingsSchema);
}

export function updatePrivacyPreferences(
    input: UpdatePrivacyPreferences,
): Promise<PrivacySettings> {
    return apiFetchWithSchema("/api/privacy/settings", privacySettingsSchema, {
        method: "PATCH",
        body: JSON.stringify(input),
    });
}

export function getPrivacyDisclosure(): Promise<PrivacyDisclosure> {
    return apiFetchWithSchema(
        "/api/privacy/disclosure",
        privacyDisclosureSchema,
    );
}

export function listExports(): Promise<DataExport[]> {
    return apiFetchWithSchema("/api/privacy/exports", exportListSchema);
}

export function createExport(
    input: CreateExportRequest,
): Promise<DataExport> {
    return apiFetchWithSchema("/api/privacy/exports", dataExportSchema, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function getExport(exportId: string): Promise<DataExport> {
    return apiFetchWithSchema(
        `/api/privacy/exports/${exportId}`,
        dataExportSchema,
    );
}

export function getDeletionPreview(): Promise<DeletionPreview> {
    return apiFetchWithSchema(
        "/api/privacy/deletion/preview",
        deletionPreviewSchema,
    );
}

/**
 * Asks for the account to be deleted.
 *
 * The confirmation phrase is sent as the constant rather than as whatever the
 * reader typed. The input box exists so the reader has to type it; what proves
 * they did is the client's own comparison before this is ever called, and the
 * server checks the literal again.
 */
export function deleteAccount(): Promise<DeletionReceipt> {
    return apiFetchWithSchema("/api/privacy/deletion", deletionReceiptSchema, {
        method: "POST",
        body: JSON.stringify({ confirmation: DELETE_ACCOUNT_CONFIRMATION }),
    });
}
