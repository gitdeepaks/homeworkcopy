import { z } from "zod";
import {
    CHAT_HISTORY_MAX_MESSAGES,
    chatTriggerSchema,
    groundingRequestSchema,
    messageFeedbackSchema,
    sourceSelectionSchema,
} from "@homeworkcopy/contracts";
import { CHAT_MODELS } from "../lib/ai-config.js";
import { workspaceIdParamSchema } from "./workspace.validator.js";

export const conversationIdParamSchema = workspaceIdParamSchema.extend({
    conversationId: z.string().trim().min(1, "Conversation id is required"),
});

export const chatBodySchema = z.intersection(
    z.object({
        conversationId: z.string().trim().min(1).optional(),
        messages: z
            .array(z.record(z.string(), z.json()))
            .min(1)
            .max(CHAT_HISTORY_MAX_MESSAGES),
        model: z.enum(CHAT_MODELS).optional(),
        trigger: chatTriggerSchema.default("submit-message"),
        messageId: z.string().trim().min(1).optional(),
    }),
    groundingRequestSchema,
);

export type ChatBody = z.infer<typeof chatBodySchema>;

export const createConversationSchema = z.object({
    title: z.string().trim().min(1).max(120).optional(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const renameConversationSchema = z.object({
    title: z.string().trim().min(1).max(120),
});

export const messageIdParamSchema = conversationIdParamSchema.extend({
    messageId: z.string().trim().min(1, "Message id is required"),
});

export const messageFeedbackBodySchema = z.object({
    feedback: messageFeedbackSchema,
});

export const chatGuideBodySchema = sourceSelectionSchema;
