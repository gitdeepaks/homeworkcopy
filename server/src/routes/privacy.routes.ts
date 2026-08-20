import { Router } from "express";
import {
    createExport,
    deleteAccount,
    listExports,
    readDeletionPreview,
    readDeletionReceipt,
    readExport,
    readPrivacyDisclosure,
    readPrivacySettings,
    writePrivacyPreferences,
} from "../controllers/privacy.controller.js";
import { requireAuth } from "../middleware/require-auth.middleware.js";
import {
    accountDeletionRateLimit,
    authSensitiveRateLimit,
    dataExportRateLimit,
} from "../middleware/rate-limit.middleware.js";
import { noStore } from "../middleware/security-headers.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";

export const privacyRoutes = Router();

privacyRoutes.use(requireAuth);

// Every response here either states someone's consent choices or carries a
// signed download URL for an archive of their data. None of it belongs in a
// shared cache or a search index.
privacyRoutes.use(noStore);

privacyRoutes.get("/settings", asyncHandler(readPrivacySettings));
privacyRoutes.patch(
    "/settings",
    authSensitiveRateLimit,
    asyncHandler(writePrivacyPreferences),
);

privacyRoutes.get("/disclosure", asyncHandler(readPrivacyDisclosure));

privacyRoutes.get("/exports", asyncHandler(listExports));
privacyRoutes.post("/exports", dataExportRateLimit, asyncHandler(createExport));
privacyRoutes.get("/exports/:exportId", asyncHandler(readExport));

privacyRoutes.get("/deletion/preview", asyncHandler(readDeletionPreview));
privacyRoutes.get("/deletion", asyncHandler(readDeletionReceipt));
privacyRoutes.post(
    "/deletion",
    accountDeletionRateLimit,
    asyncHandler(deleteAccount),
);
