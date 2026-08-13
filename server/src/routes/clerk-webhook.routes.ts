import { Router, raw } from "express";
import { handleClerkWebhook } from "../controllers/clerk-webhook.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const clerkWebhookRoutes = Router();

clerkWebhookRoutes.post(
    "/",
    raw({ type: "application/json", limit: "1mb" }),
    asyncHandler(handleClerkWebhook),
);
