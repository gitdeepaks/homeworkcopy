import type { Request, Response } from "express";
import {
    getPrivacyDisclosure,
    getPrivacySettings,
    updatePrivacyPreferences,
} from "../services/privacy.service.js";
import {
    getDataExport,
    listDataExports,
    requestDataExport,
} from "../services/data-export.service.js";
import {
    getDeletionReceipt,
    previewAccountDeletion,
    requestAccountDeletion,
} from "../services/account-deletion.service.js";
import { enqueueAccountDeletion, enqueueDataExport } from "../lib/privacy-events.js";
import {
    createExportSchema,
    deleteAccountSchema,
    exportIdParamSchema,
    updatePreferencesSchema,
} from "../validators/privacy.validator.js";

export async function readPrivacySettings(req: Request, res: Response) {
    const settings = await getPrivacySettings(req.session.user.id);
    res.json(settings);
}

export async function writePrivacyPreferences(req: Request, res: Response) {
    const input = updatePreferencesSchema.parse(req.body);
    const settings = await updatePrivacyPreferences(req.session.user.id, input);
    res.json(settings);
}

export async function readPrivacyDisclosure(req: Request, res: Response) {
    const disclosure = await getPrivacyDisclosure(req.session.user.id);
    res.json(disclosure);
}

export async function listExports(req: Request, res: Response) {
    const exports = await listDataExports(req.session.user.id);
    res.json(exports);
}

export async function createExport(req: Request, res: Response) {
    const input = createExportSchema.parse(req.body);
    const created = await requestDataExport(req.session.user.id, input.scope);

    // Queued after the row exists, so a queue outage leaves a visible pending
    // export the reader can retry rather than a job pointing at nothing.
    await enqueueDataExport({
        exportId: created.id,
        userId: req.session.user.id,
    });

    res.status(202).json(created);
}

export async function readExport(req: Request, res: Response) {
    const { exportId } = exportIdParamSchema.parse(req.params);
    const record = await getDataExport(req.session.user.id, exportId);
    res.json(record);
}

export async function readDeletionPreview(req: Request, res: Response) {
    const preview = await previewAccountDeletion(req.session.user.id);
    res.json(preview);
}

export async function readDeletionReceipt(req: Request, res: Response) {
    const receipt = await getDeletionReceipt(req.session.user.id);
    res.json(receipt);
}

export async function deleteAccount(req: Request, res: Response) {
    // Parsed before anything else: the typed confirmation phrase is the guard,
    // and it is checked here rather than trusted from the client that showed it.
    deleteAccountSchema.parse(req.body);

    const receipt = await requestAccountDeletion(req.session.user.id);
    await enqueueAccountDeletion({ userId: req.session.user.id });

    res.status(202).json(receipt);
}
