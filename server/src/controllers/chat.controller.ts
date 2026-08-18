import type { Request, Response } from "express";
import { safeValidateUIMessages } from "ai";
import {
    createConversationForWorkspace,
    deleteConversationForWorkspace,
    getConversationMessagesForWorkspace,
    listConversationsForWorkspace,
    renameConversationForWorkspace,
    setMessageFeedbackForWorkspace,
    saveMessageAsOutputForWorkspace,
    getChatGuideForWorkspace,
    streamWorkspaceChat,
} from "../services/chat.service.js";
import {
    chatBodySchema,
    conversationIdParamSchema,
    createConversationSchema,
    renameConversationSchema,
    messageIdParamSchema,
    messageFeedbackBodySchema,
    chatGuideBodySchema,
} from "../validators/chat.validator.js";
import { workspaceIdParamSchema } from "../validators/workspace.validator.js";
import { actorOf } from "../utils/actor.js";

export async function listConversations(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const conversations = await listConversationsForWorkspace(
        workspaceId,
        req.session.user.id,
    );
    res.json(conversations);
}

export async function createConversation(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const input = createConversationSchema.parse(req.body ?? {});
    const conversation = await createConversationForWorkspace(
        workspaceId,
        req.session.user.id,
        input.title,
    );
    res.status(201).json(conversation);
}

export async function listConversationMessages(req: Request, res: Response) {
    const { workspaceId, conversationId } =
        conversationIdParamSchema.parse(req.params);
    const messages = await getConversationMessagesForWorkspace(
        workspaceId,
        conversationId,
        req.session.user.id,
    );
    res.json(messages);
}

export async function deleteConversation(req: Request, res: Response) {
    const { workspaceId, conversationId } =
        conversationIdParamSchema.parse(req.params);
    await deleteConversationForWorkspace(
        workspaceId,
        conversationId,
        actorOf(req),
    );
    res.status(204).send();
}

export async function renameConversation(req: Request, res: Response) {
    const { workspaceId, conversationId } =
        conversationIdParamSchema.parse(req.params);
    const { title } = renameConversationSchema.parse(req.body);
    const conversation = await renameConversationForWorkspace(
        workspaceId,
        conversationId,
        req.session.user.id,
        title,
    );
    res.json(conversation);
}

export async function setMessageFeedback(req: Request, res: Response) {
    const { workspaceId, conversationId, messageId } =
        messageIdParamSchema.parse(req.params);
    const { feedback } = messageFeedbackBodySchema.parse(req.body);
    const message = await setMessageFeedbackForWorkspace(
        workspaceId,
        conversationId,
        messageId,
        req.session.user.id,
        feedback,
    );
    res.json(message);
}

export async function saveMessageAsOutput(req: Request, res: Response) {
    const { workspaceId, conversationId, messageId } =
        messageIdParamSchema.parse(req.params);
    const output = await saveMessageAsOutputForWorkspace(
        workspaceId,
        conversationId,
        messageId,
        req.session.user.id,
    );
    res.status(201).json(output);
}

export async function getChatGuide(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const selection = chatGuideBodySchema.parse(req.body);
    const guide = await getChatGuideForWorkspace(
        workspaceId,
        req.session.user.id,
        selection,
    );
    res.json(guide);
}

export async function streamChat(req: Request, res: Response) {
    const { workspaceId } = workspaceIdParamSchema.parse(req.params);
    const body = chatBodySchema.parse(req.body);
    const validatedMessages = await safeValidateUIMessages({ messages: body.messages });
    if (!validatedMessages.success) throw validatedMessages.error;

    const abortController = new globalThis.AbortController();
    const abort = () => abortController.abort();
    req.once("aborted", abort);
    res.once("close", () => {
        if (!res.writableEnded) abort();
    });

    await streamWorkspaceChat(res, workspaceId, req.session.user.id, {
        conversationId: body.conversationId,
        messages: validatedMessages.data,
        model: body.model,
        selectionMode: body.selectionMode,
        sourceIds: body.sourceIds,
        groundingMode: body.groundingMode,
        trigger: body.trigger,
        messageId: body.messageId,
        abortSignal: abortController.signal,
    });
}
