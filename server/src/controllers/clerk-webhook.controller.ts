import { verifyWebhook } from "@clerk/express/webhooks";
import type { Request, Response } from "express";
import {
    beginClerkWebhook,
    completeClerkWebhook,
    failClerkWebhook,
} from "../repositories/clerk-webhook.repository.js";
import {
    unlinkDeletedClerkUser,
    updateUserFromClerk,
} from "../repositories/user.repository.js";
import { resolveLocalUser } from "../services/auth.service.js";
import { logger } from "../lib/logger.js";
import { ValidationError } from "../types/app-error.js";

function profileName(firstName: string | null, lastName: string | null) {
    return [firstName, lastName].filter((part) => part?.trim()).join(" ") || "Homeworkcopy user";
}

export async function handleClerkWebhook(req: Request, res: Response) {
    const event = await verifyWebhook(req).catch(() => {
        throw new ValidationError("Invalid Clerk webhook signature");
    });
    const eventId = req.header("svix-id");

    if (!eventId) {
        res.status(400).send("Missing webhook event id");
        return;
    }

    if (!(await beginClerkWebhook(eventId, event.type))) {
        res.status(200).send("Already processed");
        return;
    }

    try {
        if (event.type === "user.created") {
            await resolveLocalUser(event.data.id);
        } else if (event.type === "user.updated") {
            await updateUserFromClerk(event.data.id, {
                name: profileName(event.data.first_name, event.data.last_name),
                image: event.data.image_url || null,
            });
        } else if (event.type === "user.deleted" && event.data.id) {
            // Domain data is retained; deletion only disconnects the identity pending policy review.
            await unlinkDeletedClerkUser(event.data.id);
        }

        await completeClerkWebhook(eventId);
        res.status(200).send("Webhook received");
    } catch (error) {
        await failClerkWebhook(eventId, "PROCESSING_FAILED");
        logger.error({ error, eventId, eventType: event.type }, "Clerk webhook failed");
        throw error;
    }
}
