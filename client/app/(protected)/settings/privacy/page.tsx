import type { Metadata } from "next";
import { requireAuth } from "@/features/auth";
import { PrivacySettings } from "@/features/privacy";

/**
 * The disclosure names providers and describes what an account holds. It is
 * behind a sign-in and specific to the reader, so it should never be indexed.
 */
export const metadata: Metadata = {
    title: "Privacy",
    robots: { index: false, follow: false, nocache: true },
};

export default async function PrivacySettingsPage() {
    await requireAuth();

    return <PrivacySettings />;
}
