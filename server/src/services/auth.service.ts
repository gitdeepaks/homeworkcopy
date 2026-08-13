import { clerkClient } from "@clerk/express";
import {
    createUserFromClerk,
    findUserByClerkId,
    findUsersByEmail,
    linkUserToClerk,
} from "../repositories/user.repository.js";
import { ConflictError, UnauthorizedError } from "../types/app-error.js";
import { withTimeout } from "../lib/timeout.js";

function getVerifiedPrimaryEmail(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
    const primaryEmail = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId,
    );

    if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
        throw new UnauthorizedError("A verified primary email is required");
    }

    return primaryEmail.emailAddress.trim().toLowerCase();
}

export async function resolveLocalUser(clerkUserId: string) {
    const linkedUser = await findUserByClerkId(clerkUserId);

    if (linkedUser) {
        return linkedUser;
    }

    const clerkUser = await withTimeout(
        "Clerk user lookup",
        10_000,
        clerkClient.users.getUser(clerkUserId),
    );
    const email = getVerifiedPrimaryEmail(clerkUser);
    const name =
        [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
        email.split("@")[0] ||
        "Homeworkcopy user";
    const profile = { name, image: clerkUser.imageUrl || null };
    const matchingUsers = await findUsersByEmail(email);
    if (matchingUsers.length > 1) {
        throw new ConflictError("Multiple legacy users match this verified email");
    }
    const existingUser = matchingUsers[0];

    if (existingUser) {
        if (existingUser.clerkUserId && existingUser.clerkUserId !== clerkUserId) {
            throw new ConflictError("Email is already linked to another Clerk user");
        }

        const linked = await linkUserToClerk(existingUser.id, clerkUserId, profile);
        if (!linked) {
            throw new ConflictError("User was linked by another sign-in request");
        }
        return linked;
    }

    try {
        return await createUserFromClerk({ clerkUserId, email, ...profile });
    } catch (error) {
        // Parallel first requests can race while provisioning the same Clerk user.
        const provisionedUser =
            (await findUserByClerkId(clerkUserId)) ??
            (await findUsersByEmail(email))[0];

        if (provisionedUser?.clerkUserId === clerkUserId) {
            return provisionedUser;
        }

        throw error;
    }
}
