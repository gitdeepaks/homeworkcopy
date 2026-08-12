"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useClerk } from "@clerk/nextjs";
import { authRoutes } from "../lib/auth-routes";

export function SignOutButton() {
    const router = useRouter();
    const { signOut } = useClerk();
    const [isLoading, setIsLoading] = useState(false);

    async function handleSignOut() {
        setIsLoading(true);

        await signOut({ redirectUrl: authRoutes.login });

        setIsLoading(false);
        router.refresh();
    }

    return (
        <Button
            variant="outline"
            onClick={() => void handleSignOut()}
            disabled={isLoading}
        >
            {isLoading ? <Spinner /> : null}
            Sign out
        </Button>
    );
}
