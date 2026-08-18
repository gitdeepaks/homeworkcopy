import type { Metadata } from "next";
import { requireAuth } from "@/features/auth";
import { AcceptShareCard } from "@/features/collaboration/components/accept-share-card";

/**
 * A share link is a bearer capability, so this page must never be discoverable
 * by anyone who was not handed the link.
 */
export const metadata: Metadata = {
    title: "Shared notebook",
    robots: { index: false, follow: false, nocache: true },
};

type SharePageProps = {
    params: Promise<{ token: string }>;
};

export default async function SharePage({ params }: SharePageProps) {
    await requireAuth();
    const { token } = await params;

    return (
        <div className="notebook-canvas min-h-svh">
            <main
                id="main-content"
                className="mx-auto flex min-h-svh max-w-xl items-center px-4 py-10"
            >
                <div className="paper-sheet w-full rounded-md p-8">
                    <AcceptShareCard kind="link" token={token} />
                </div>
            </main>
        </div>
    );
}
