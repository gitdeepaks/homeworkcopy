export type Session = {
    user: {
        id: string;
        clerkUserId: string;
        name: string;
        email: string;
        image: string | null;
    };
};
