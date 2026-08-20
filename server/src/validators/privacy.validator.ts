import {
    createExportRequestSchema,
    deleteAccountRequestSchema,
    updatePrivacyPreferencesSchema,
} from "@homeworkcopy/contracts";
import { z } from "zod";

export const updatePreferencesSchema = updatePrivacyPreferencesSchema;
export const createExportSchema = createExportRequestSchema;
export const deleteAccountSchema = deleteAccountRequestSchema;

export const exportIdParamSchema = z.object({
    exportId: z.string().trim().min(1),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type CreateExportInput = z.infer<typeof createExportSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
