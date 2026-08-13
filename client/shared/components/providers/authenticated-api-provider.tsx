"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { setApiTokenGetter } from "@/shared/lib/api";

export function AuthenticatedApiProvider({ children }: { children: React.ReactNode }) {
    const { getToken } = useAuth();

    useEffect(() => {
        setApiTokenGetter(getToken);
        return () => setApiTokenGetter(null);
    }, [getToken]);

    return children;
}
