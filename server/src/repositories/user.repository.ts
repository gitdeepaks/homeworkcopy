import prisma from "../lib/db.js";

export function findUserByClerkId(clerkUserId: string) {
    return prisma.user.findUnique({ where: { clerkUserId } });
}

export function findUsersByEmail(email: string) {
    return prisma.user.findMany({
        where: { email: { equals: email, mode: "insensitive" } },
        take: 2,
    });
}

export async function linkUserToClerk(
    id: string,
    clerkUserId: string,
    profile: { name: string; image: string | null },
) {
    const result = await prisma.user.updateMany({
        where: {
            id,
            OR: [{ clerkUserId: null }, { clerkUserId }],
        },
        data: {
            clerkUserId,
            name: profile.name,
            image: profile.image,
            emailVerified: true,
        },
    });

    if (result.count !== 1) return null;
    return prisma.user.findUniqueOrThrow({ where: { id } });
}

export function updateUserFromClerk(
    clerkUserId: string,
    profile: { name: string; image: string | null },
) {
    return prisma.user.updateMany({
        where: { clerkUserId },
        data: { ...profile, emailVerified: true },
    });
}

export function unlinkDeletedClerkUser(clerkUserId: string) {
    return prisma.user.updateMany({
        where: { clerkUserId },
        data: { clerkUserId: null },
    });
}

export function createUserFromClerk(input: {
    clerkUserId: string;
    email: string;
    name: string;
    image: string | null;
}) {
    return prisma.user.create({
        data: {
            id: crypto.randomUUID(),
            clerkUserId: input.clerkUserId,
            email: input.email,
            emailVerified: true,
            name: input.name,
            image: input.image,
        },
    });
}
