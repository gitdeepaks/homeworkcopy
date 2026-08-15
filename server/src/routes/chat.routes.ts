import { Router } from "express";
import {
    createConversation,
    deleteConversation,
    listConversationMessages,
    listConversations,
    renameConversation,
    setMessageFeedback,
    saveMessageAsOutput,
    getChatGuide,
    streamChat,
} from "../controllers/chat.controller.js";
import { asyncHandler } from "../utils/async-handler.js";
import { chatRateLimit } from "../middleware/rate-limit.middleware.js";

export const conversationRoutes = Router({ mergeParams: true });

conversationRoutes.get("/", asyncHandler(listConversations));
conversationRoutes.post("/", asyncHandler(createConversation));
conversationRoutes.get(
    "/:conversationId/messages",
    asyncHandler(listConversationMessages),
);
conversationRoutes.patch(
    "/:conversationId",
    asyncHandler(renameConversation),
);
conversationRoutes.put(
    "/:conversationId/messages/:messageId/feedback",
    asyncHandler(setMessageFeedback),
);
conversationRoutes.post(
    "/:conversationId/messages/:messageId/output",
    asyncHandler(saveMessageAsOutput),
);
conversationRoutes.delete(
    "/:conversationId",
    asyncHandler(deleteConversation),
);

export const chatRoutes = Router({ mergeParams: true });

chatRoutes.post("/", chatRateLimit, asyncHandler(streamChat));
chatRoutes.post("/guide", chatRateLimit, asyncHandler(getChatGuide));
