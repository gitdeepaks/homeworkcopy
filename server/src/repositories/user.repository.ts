import prisma from "../lib/db.js";

export function findUserByClerkId(clerkUserId: string) {
    return prisma.user.findUnique({ where: { clerkUserId } });
}

export function findUserByEmail(email: string) {
    return prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
    });
}

export function linkUserToClerk(
    id: string,
    clerkUserId: string,
    profile: { name: string; image: string | null },
) {
    return prisma.user.update({
        where: { id },
        data: {
            clerkUserId,
            name: profile.name,
            image: profile.image,
            emailVerified: true,
        },
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
