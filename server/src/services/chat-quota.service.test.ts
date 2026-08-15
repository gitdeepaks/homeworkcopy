import { describe, expect, test } from "bun:test";
import type { UIMessage } from "ai";
import { CHAT_MESSAGE_MAX_LENGTH } from "@homeworkcopy/contracts";
import {
    estimateChatInputTokens,
    validateChatMessageLengths,
} from "./chat-quota.service.js";
import { ValidationError } from "../types/app-error.js";

function message(id: string, text: string): UIMessage {
    return { id, role: "user", parts: [{ type: "text", text }] };
}

describe("chat quota input controls", () => {
    test("estimates a positive bounded token reservation", () => {
        expect(estimateChatInputTokens([message("one", "12345678")])).toBe(2);
        expect(estimateChatInputTokens([message("empty", "")])).toBe(1);
    });

    test("rejects oversized messages before provider work", () => {
        expect(() =>
            validateChatMessageLengths([
                message("large", "x".repeat(CHAT_MESSAGE_MAX_LENGTH + 1)),
            ]),
        ).toThrow(ValidationError);
    });
});
