import { clerkClient } from "@clerk/express";
import {
    createUserFromClerk,
    findUserByClerkId,
    findUserByEmail,
    linkUserToClerk,
} from "../repositories/user.repository.js";

function getVerifiedPrimaryEmail(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
    const primaryEmail = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId,
    );

    if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
        throw new Error("Clerk user requires a verified primary email");
    }

    return primaryEmail.emailAddress.trim().toLowerCase();
}

export async function resolveLocalUser(clerkUserId: string) {
    const linkedUser = await findUserByClerkId(clerkUserId);

    if (linkedUser) {
        return linkedUser;
    }

    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = getVerifiedPrimaryEmail(clerkUser);
    const name =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        email.split("@")[0] ||
        "Homeworkcopy user";
    const profile = { name, image: clerkUser.imageUrl || null };
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
        if (existingUser.clerkUserId && existingUser.clerkUserId !== clerkUserId) {
            throw new Error("Email is already linked to another Clerk user");
        }

        return linkUserToClerk(existingUser.id, clerkUserId, profile);
    }

    try {
        return await createUserFromClerk({ clerkUserId, email, ...profile });
    } catch (error) {
        // Parallel first requests can race while provisioning the same Clerk user.
        const provisionedUser =
            (await findUserByClerkId(clerkUserId)) ??
            (await findUserByEmail(email));

        if (provisionedUser?.clerkUserId === clerkUserId) {
            return provisionedUser;
        }

        throw error;
    }
}
