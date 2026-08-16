import { Router } from "express";
import {
    cancelArtifact,
    createArtifact,
    deleteArtifact,
    duplicateArtifact,
    getArtifact,
    getArtifactAudio,
    listArtifacts,
    regenerateArtifact,
    renameArtifact,
} from "../controllers/artifact.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { generationRateLimit } from "../middleware/rate-limit.middleware.js";

export const artifactRoutes = Router({ mergeParams: true });

artifactRoutes.get("/", asyncHandler(listArtifacts));
artifactRoutes.post("/", generationRateLimit, asyncHandler(createArtifact));
artifactRoutes.get("/:artifactId", asyncHandler(getArtifact));
artifactRoutes.get("/:artifactId/audio", asyncHandler(getArtifactAudio));
artifactRoutes.patch("/:artifactId", asyncHandler(renameArtifact));
artifactRoutes.post(
    "/:artifactId/regenerate",
    generationRateLimit,
    asyncHandler(regenerateArtifact),
);
artifactRoutes.post(
    "/:artifactId/duplicate",
    generationRateLimit,
    asyncHandler(duplicateArtifact),
);
artifactRoutes.post("/:artifactId/cancel", asyncHandler(cancelArtifact));
artifactRoutes.delete("/:artifactId", asyncHandler(deleteArtifact));
