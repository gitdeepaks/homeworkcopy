"use client";

import { PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type CreateWorkspaceCardProps = {
    onClick: () => void;
    className?: string;
};

/** The empty slot on the shelf, drawn as a ruled-off card waiting to be filled. */
export function CreateWorkspaceCard({
    onClick,
    className,
}: CreateWorkspaceCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "group flex min-h-[13rem] flex-col justify-between rounded-sm border border-dashed border-hairline bg-transparent p-5 text-left transition-colors duration-200 hover:border-primary hover:bg-paper",
                className,
            )}
        >
            <p className="marginalia">New</p>

            <span>
                <span className="flex size-9 items-center justify-center rounded-full border border-hairline text-graphite transition-colors duration-200 group-hover:border-primary group-hover:text-primary">
                    <PlusIcon className="size-4" />
                </span>
                <span className="mt-4 block font-display text-[1.6rem] leading-[1.15] font-semibold tracking-[-0.02em]">
                    Create notebook
                </span>
                <span className="mt-2 block font-mono text-[0.7rem] text-graphite">
                    Add sources, then ask
                </span>
            </span>
        </button>
    );
}
