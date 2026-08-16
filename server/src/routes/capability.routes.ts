import { Router } from "express";
import type { Request, Response } from "express";
import type { StudioCapabilities } from "@homeworkcopy/contracts";
import { requireAuth } from "../middleware/require-auth.middleware.js";
import { isAudioOverviewAvailable } from "../services/audio-overview.service.js";

export const capabilityRoutes = Router();

capabilityRoutes.use(requireAuth);

/**
 * Reports which optional Studio tools this deployment can deliver, so the
 * client never offers a tool whose providers are not configured.
 */
capabilityRoutes.get("/", (_req: Request, res: Response) => {
    const capabilities: StudioCapabilities = {
        version: 1,
        audioOverview: isAudioOverviewAvailable(),
    };
    res.json(capabilities);
});
