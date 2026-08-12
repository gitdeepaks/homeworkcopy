import { auth, currentUser } from "@clerk/nextjs/server";

export type Session = {
    user: {
        id: string;
        name: string;
        email: string;
        image: string | null;
    };
};

export async function getSession(): Promise<Session | null> {
    const { userId } = await auth();

    if (!userId) {
        return null;
    }

    const user = await currentUser();

    if (!user) {
        return null;
    }

    const primaryEmail = user.emailAddresses.find(
        (email) => email.id === user.primaryEmailAddressId,
    );

    return {
        user: {
            id: user.id,
            name:
                [user.firstName, user.lastName].filter(Boolean).join(" ") ||
                primaryEmail?.emailAddress ||
                "Homeworkcopy user",
            email: primaryEmail?.emailAddress ?? "",
            image: user.imageUrl || null,
        },
    };
}
