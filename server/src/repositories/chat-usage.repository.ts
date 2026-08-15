import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";

type ReservedUsage = {
    id: string;
};

export async function reserveDailyChatUsage(input: {
    userId: string;
    periodStart: Date;
    estimatedInputTokens: number;
    reservedOutputTokens: number;
    requestLimit: number;
    tokenLimit: number;
}): Promise<boolean> {
    const rows = await prisma.$queryRaw<ReservedUsage[]>(Prisma.sql`
        INSERT INTO "chat_usage" (
            "id", "userId", "periodStart", "requestCount", "inputTokens",
            "outputTokens", "createdAt", "updatedAt"
        ) SELECT
            ${randomUUID()}, ${input.userId}, ${input.periodStart}, 1,
            CAST(${input.estimatedInputTokens} AS INTEGER),
            CAST(${input.reservedOutputTokens} AS INTEGER), NOW(), NOW()
        WHERE 1 <= CAST(${input.requestLimit} AS INTEGER)
          AND CAST(${input.estimatedInputTokens} AS INTEGER)
              + CAST(${input.reservedOutputTokens} AS INTEGER)
              <= CAST(${input.tokenLimit} AS INTEGER)
        ON CONFLICT ("userId", "periodStart") DO UPDATE SET
            "requestCount" = "chat_usage"."requestCount" + 1,
            "inputTokens" = "chat_usage"."inputTokens"
                + CAST(${input.estimatedInputTokens} AS INTEGER),
            "outputTokens" = "chat_usage"."outputTokens"
                + CAST(${input.reservedOutputTokens} AS INTEGER),
            "updatedAt" = NOW()
        WHERE "chat_usage"."requestCount" < CAST(${input.requestLimit} AS INTEGER)
          AND "chat_usage"."inputTokens" + "chat_usage"."outputTokens"
              + CAST(${input.estimatedInputTokens} AS INTEGER)
              + CAST(${input.reservedOutputTokens} AS INTEGER)
              <= CAST(${input.tokenLimit} AS INTEGER)
        RETURNING "id"
    `);
    return rows.length === 1;
}

export function reconcileDailyChatUsage(input: {
    userId: string;
    periodStart: Date;
    estimatedInputTokens: number;
    actualInputTokens: number;
    actualOutputTokens: number;
    reservedOutputTokens: number;
}) {
    return prisma.chatUsage.update({
        where: {
            userId_periodStart: {
                userId: input.userId,
                periodStart: input.periodStart,
            },
        },
        data: {
            inputTokens: {
                increment: input.actualInputTokens - input.estimatedInputTokens,
            },
            outputTokens: {
                increment: input.actualOutputTokens - input.reservedOutputTokens,
            },
        },
    });
}
