import prisma from "../lib/db.js";

export async function beginClerkWebhook(id: string, type: string) {
    const existing = await prisma.clerkWebhookEvent.findUnique({ where: { id } });
    if (existing?.status === "PROCESSED") return false;

    await prisma.clerkWebhookEvent.upsert({
        where: { id },
        create: { id, type },
        update: { type, status: "PROCESSING", errorCode: null },
    });
    return true;
}

export function completeClerkWebhook(id: string) {
    return prisma.clerkWebhookEvent.update({
        where: { id },
        data: { status: "PROCESSED", processedAt: new Date(), errorCode: null },
    });
}

export function failClerkWebhook(id: string, errorCode: string) {
    return prisma.clerkWebhookEvent.update({
        where: { id },
        data: { status: "FAILED", errorCode },
    });
}
