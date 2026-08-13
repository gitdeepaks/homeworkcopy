"use client";

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
    BrainIcon,
    CheckIcon,
    LaptopIcon,
    LogOutIcon,
    MoonIcon,
    SunIcon,
    UserRoundIcon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { memoryRoutes } from "@/features/memory";
import { authRoutes } from "../lib/auth-routes";

const THEMES = [
    { id: "light", label: "Light paper", icon: SunIcon },
    { id: "dark", label: "Dark paper", icon: MoonIcon },
    { id: "system", label: "System theme", icon: LaptopIcon },
] as const;

export function AccountMenu() {
    const router = useRouter();
    const { openUserProfile, signOut } = useClerk();
    const { user } = useUser();
    const { theme, setTheme } = useTheme();
    const [isSigningOut, setIsSigningOut] = useState(false);

    const displayName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Account";
    const initials = displayName
        .split(/\s+/)
        .map((part) => part.at(0))
        .filter((part): part is string => part !== undefined)
        .slice(0, 2)
        .join("")
        .toUpperCase();

    async function handleSignOut() {
        setIsSigningOut(true);
        await signOut({ redirectUrl: authRoutes.login });
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 rounded-full border border-border bg-paper p-1 shadow-sm"
                        aria-label="Open account menu"
                    />
                }
            >
                <Avatar className="size-8">
                    {user?.imageUrl ? (
                        <AvatarImage src={user.imageUrl} alt="" />
                    ) : null}
                    <AvatarFallback>{initials || "HC"}</AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="paper-sheet w-64 bg-popover p-2"
            >
                <DropdownMenuGroup>
                    <DropdownMenuLabel className="px-2 py-2">
                        <span className="block truncate font-semibold text-foreground">
                            {displayName}
                        </span>
                        <span className="block truncate font-normal">
                            {user?.primaryEmailAddress?.emailAddress}
                        </span>
                    </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => openUserProfile()}>
                        <UserRoundIcon />
                        Manage account
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => router.push(memoryRoutes.settings)}
                    >
                        <BrainIcon />
                        Memory
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    <DropdownMenuLabel>Appearance</DropdownMenuLabel>
                    {THEMES.map((option) => (
                        <DropdownMenuItem
                            key={option.id}
                            onClick={() => setTheme(option.id)}
                        >
                            <option.icon />
                            {option.label}
                            {theme === option.id ? (
                                <CheckIcon className="ml-auto" />
                            ) : null}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    variant="destructive"
                    disabled={isSigningOut}
                    onClick={() => void handleSignOut()}
                >
                    {isSigningOut ? <Spinner /> : <LogOutIcon />}
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
