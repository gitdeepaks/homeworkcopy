import type { LanguageModelUsage, UIMessage } from "ai";
import { CHAT_MESSAGE_MAX_LENGTH } from "@homeworkcopy/contracts";
import {
    reconcileDailyChatUsage,
    reserveDailyChatUsage,
} from "../repositories/chat-usage.repository.js";
import { ChatQuotaExceededError, ValidationError } from "../types/app-error.js";
import { getTextFromUIMessage } from "../utils/chat-message.js";
import { CHAT_MAX_OUTPUT_TOKENS } from "../lib/ai-config.js";

const DEFAULT_DAILY_REQUEST_LIMIT = 100;
const DEFAULT_DAILY_TOKEN_LIMIT = 500_000;
const TOKEN_CHARACTER_RATIO = 4;

// A started provider attempt keeps its reservation on failure/cancellation.
// This conservative policy prevents repeated failed requests from bypassing limits.

function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function estimateChatInputTokens(messages: UIMessage[]): number {
    const characterCount = messages.reduce(
        (total, message) => total + getTextFromUIMessage(message).length,
        0,
    );
    return Math.max(1, Math.ceil(characterCount / TOKEN_CHARACTER_RATIO));
}

export function validateChatMessageLengths(messages: UIMessage[]): void {
    const oversized = messages.some(
        (message) => getTextFromUIMessage(message).length > CHAT_MESSAGE_MAX_LENGTH,
    );
    if (oversized) {
        throw new ValidationError(
            `Chat messages must be ${CHAT_MESSAGE_MAX_LENGTH.toLocaleString()} characters or fewer`,
        );
    }
}

export async function reserveChatQuota(
    userId: string,
    messages: UIMessage[],
    additionalCharacterCount = 0,
    reservedOutputTokens = CHAT_MAX_OUTPUT_TOKENS,
) {
    const periodStart = new Date();
    periodStart.setUTCHours(0, 0, 0, 0);
    const resetAt = new Date(periodStart);
    resetAt.setUTCDate(resetAt.getUTCDate() + 1);
    const estimatedInputTokens =
        estimateChatInputTokens(messages) +
        Math.ceil(Math.max(0, additionalCharacterCount) / TOKEN_CHARACTER_RATIO);
    const reserved = await reserveDailyChatUsage({
        userId,
        periodStart,
        estimatedInputTokens,
        reservedOutputTokens,
        requestLimit: positiveInteger(
            process.env.CHAT_DAILY_REQUEST_LIMIT,
            DEFAULT_DAILY_REQUEST_LIMIT,
        ),
        tokenLimit: positiveInteger(
            process.env.CHAT_DAILY_TOKEN_LIMIT,
            DEFAULT_DAILY_TOKEN_LIMIT,
        ),
    });
    if (!reserved) throw new ChatQuotaExceededError(resetAt.toISOString());
    return {
        periodStart,
        estimatedInputTokens,
        reservedOutputTokens,
    };
}

export async function reconcileChatQuota(
    userId: string,
    reservation: {
        periodStart: Date;
        estimatedInputTokens: number;
        reservedOutputTokens: number;
    },
    usage: LanguageModelUsage,
): Promise<void> {
    await reconcileDailyChatUsage({
        userId,
        periodStart: reservation.periodStart,
        estimatedInputTokens: reservation.estimatedInputTokens,
        actualInputTokens: usage.inputTokens ?? reservation.estimatedInputTokens,
        actualOutputTokens: usage.outputTokens ?? 0,
        reservedOutputTokens: reservation.reservedOutputTokens,
    });
}
