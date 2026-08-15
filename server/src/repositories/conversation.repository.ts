import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/db.js";
import { ConflictError } from "../types/app-error.js";

const GENERATION_LEASE_MS = 5 * 60 * 1_000;

export const conversationSelect = {
    id: true,
    workspaceId: true,
    title: true,
    summary: true,
    summaryMessageCount: true,
    summarizedAt: true,
    historyRevision: true,
    createdAt: true,
    updatedAt: true,
} as const;

export type ConversationRecord = Prisma.ConversationGetPayload<{
    select: typeof conversationSelect;
}>;

export function findConversationsByWorkspaceId(workspaceId: string) {
    return prisma.conversation.findMany({
        where: { workspaceId },
        select: conversationSelect,
        orderBy: { updatedAt: "desc" },
    });
}

export function findConversationById(conversationId: string) {
    return prisma.conversation.findUnique({
        where: { id: conversationId },
        select: conversationSelect,
    });
}

export function findConversationByIdAndWorkspaceId(
    conversationId: string,
    workspaceId: string,
) {
    return prisma.conversation.findFirst({
        where: { id: conversationId, workspaceId },
        select: conversationSelect,
    });
}

export function createConversationRecord(workspaceId: string, title?: string) {
    return prisma.conversation.create({
        data: {
            workspaceId,
            title: title ?? null,
        },
        select: conversationSelect,
    });
}

export function updateConversationSummary(
    conversationId: string,
    data: {
        summary: string;
        summaryMessageCount: number;
        historyRevision: number;
    },
) {
    return prisma.conversation.updateMany({
        where: {
            id: conversationId,
            summaryMessageCount: { lt: data.summaryMessageCount },
            historyRevision: data.historyRevision,
        },
        data: {
            summary: data.summary,
            summaryMessageCount: data.summaryMessageCount,
            summarizedAt: new Date(),
        },
    });
}

export function updateConversationRecord(
    conversationId: string,
    data: { title?: string | null },
) {
    return prisma.conversation.update({
        where: { id: conversationId },
        data,
        select: conversationSelect,
    });
}

export function touchConversation(conversationId: string) {
    return prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
        select: conversationSelect,
    });
}

export async function deleteConversationRecord(conversationId: string) {
    await prisma.conversation.delete({
        where: { id: conversationId },
    });
}

export async function claimConversationGeneration(conversationId: string) {
    const now = new Date();
    const leaseId = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + GENERATION_LEASE_MS);
    const claimed = await prisma.conversation.updateMany({
        where: {
            id: conversationId,
            OR: [
                { generationLeaseId: null },
                { generationLeaseExpiresAt: { lt: now } },
            ],
        },
        data: {
            generationLeaseId: leaseId,
            generationLeaseExpiresAt: leaseExpiresAt,
        },
    });
    if (claimed.count !== 1) {
        throw new ConflictError("Another answer is already being generated in this conversation");
    }
    return leaseId;
}

export function releaseConversationGeneration(
    conversationId: string,
    leaseId: string,
) {
    return prisma.conversation.updateMany({
        where: { id: conversationId, generationLeaseId: leaseId },
        data: {
            generationLeaseId: null,
            generationLeaseExpiresAt: null,
        },
    });
}
