import { Router } from "express";
import {
    bulkDeleteSources,
    createSource,
    deleteSource,
    getSource,
    getSourceChunks,
    importWebSearch,
    importWebsite,
    importYoutube,
    listSources,
    reprocessSource,
    reprocessSources,
    uploadPdf,
} from "../controllers/source.controller.js";
import { uploadSinglePdf } from "../middleware/upload.middleware.js";
import { asyncHandler } from "../utils/async-handler.js";
import { sourceImportRateLimit } from "../middleware/rate-limit.middleware.js";

export const sourceRoutes = Router({ mergeParams: true });

sourceRoutes.get("/", asyncHandler(listSources));
sourceRoutes.post("/", sourceImportRateLimit, asyncHandler(createSource));
sourceRoutes.post(
    "/upload",
    sourceImportRateLimit,
    uploadSinglePdf,
    asyncHandler(uploadPdf),
);
sourceRoutes.post("/import/website", sourceImportRateLimit, asyncHandler(importWebsite));
sourceRoutes.post("/import/youtube", sourceImportRateLimit, asyncHandler(importYoutube));
sourceRoutes.post("/import/web-search", sourceImportRateLimit, asyncHandler(importWebSearch));
sourceRoutes.post("/bulk-delete", asyncHandler(bulkDeleteSources));
sourceRoutes.post("/reprocess", sourceImportRateLimit, asyncHandler(reprocessSources));
sourceRoutes.get("/:sourceId/chunks", asyncHandler(getSourceChunks));
sourceRoutes.get("/:sourceId", asyncHandler(getSource));
sourceRoutes.post("/:sourceId/reprocess", sourceImportRateLimit, asyncHandler(reprocessSource));
sourceRoutes.delete("/:sourceId", asyncHandler(deleteSource));
