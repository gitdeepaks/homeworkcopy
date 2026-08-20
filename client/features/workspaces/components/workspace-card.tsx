"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
    LogOutIcon,
    MoreHorizontalIcon,
    PencilIcon,
    Trash2Icon,
    UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { can, ROLE_LABELS } from "@/features/collaboration/lib/permissions";
import { cn } from "@/lib/utils";
import { workspaceRoutes } from "../lib/routes";
import type { Workspace } from "../lib/types";

type WorkspaceCardProps = {
    workspace: Workspace;
    onEdit: (workspace: Workspace) => void;
    onDelete: (workspace: Workspace) => void;
    /** Offered on notebooks the reader does not own. */
    onLeave?: (workspace: Workspace) => void;
    className?: string;
};

/**
 * One notebook, set as a catalogue card.
 *
 * The whole card is a link, so the menu is lifted back above it with its own
 * stacking context rather than nested inside the anchor — a button inside an
 * `<a>` is invalid markup and behaves differently in every browser.
 */
export function WorkspaceCard({
    workspace,
    onEdit,
    onDelete,
    onLeave,
    className,
}: WorkspaceCardProps) {
    const canEdit = can(workspace.role, "notebook:update");
    const canDelete = can(workspace.role, "notebook:delete");
    const canLeave = workspace.role !== "OWNER" && onLeave !== undefined;
    const hasMenu = canEdit || canDelete || canLeave;

    return (
        <article
            className={cn(
                "paper-sheet lift group/card relative flex min-h-[13rem] flex-col rounded-sm",
                className,
            )}
        >
            {/* The spine. A bound volume is identified by its edge before it is
                identified by its cover. */}
            <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-[3px] bg-primary/25 transition-colors duration-200 group-hover/card:bg-primary"
            />

            <Link
                href={workspaceRoutes.detail(workspace.id)}
                className="absolute inset-0 z-0 rounded-sm"
                aria-label={`Open ${workspace.title}`}
            />

            <div className="pointer-events-none relative flex flex-1 flex-col p-5 pl-6">
                {/* Call number. Mono, letterspaced, the way a shelf label is. */}
                <div className="flex items-start justify-between gap-3">
                    <p className="marginalia flex items-center gap-2.5 pt-1">
                        <span aria-hidden="true" className="text-sm">
                            {workspace.icon ?? "§"}
                        </span>
                        {workspace.audience === "shared"
                            ? ROLE_LABELS[workspace.role]
                            : "Notebook"}
                    </p>

                    {hasMenu ? (
                        <div className="pointer-events-auto relative z-10 -mt-1 -mr-1">
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    render={
                                        <Button
                                            variant="ghost"
                                            size="icon-sm"
                                            className="size-9 rounded-sm text-graphite opacity-0 transition-opacity focus-visible:opacity-100 group-hover/card:opacity-100"
                                        />
                                    }
                                >
                                    <MoreHorizontalIcon />
                                    <span className="sr-only">
                                        Actions for {workspace.title}
                                    </span>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {canEdit ? (
                                        <DropdownMenuItem
                                            onClick={() => onEdit(workspace)}
                                        >
                                            <PencilIcon />
                                            Edit
                                        </DropdownMenuItem>
                                    ) : null}
                                    {canLeave ? (
                                        <DropdownMenuItem
                                            variant="destructive"
                                            onClick={() => onLeave(workspace)}
                                        >
                                            <LogOutIcon />
                                            Leave notebook
                                        </DropdownMenuItem>
                                    ) : null}
                                    {canDelete ? (
                                        <DropdownMenuItem
                                            variant="destructive"
                                            onClick={() => onDelete(workspace)}
                                        >
                                            <Trash2Icon />
                                            Delete
                                        </DropdownMenuItem>
                                    ) : null}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ) : null}
                </div>

                <h3 className="mt-5 line-clamp-2 font-display text-[1.6rem] leading-[1.15] font-semibold tracking-[-0.02em]">
                    {workspace.title}
                </h3>

                {workspace.description ? (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-graphite">
                        {workspace.description}
                    </p>
                ) : null}

                {/* Colophon. Everything that is metadata rather than content is
                    set in mono below a hairline, so the eye can skip it. */}
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-3.5 font-mono text-[0.7rem] text-graphite">
                    <time dateTime={workspace.updatedAt}>
                        {formatDistanceToNow(new Date(workspace.updatedAt), {
                            addSuffix: true,
                        })}
                    </time>

                    {workspace.audience === "shared" ? (
                        <>
                            <span aria-hidden="true" className="text-hairline">
                                ·
                            </span>
                            <span className="flex items-center gap-1.5">
                                <UsersIcon aria-hidden className="size-3" />
                                {workspace.memberCount}
                            </span>
                            {workspace.role === "OWNER" ? null : (
                                <>
                                    <span
                                        aria-hidden="true"
                                        className="text-hairline"
                                    >
                                        ·
                                    </span>
                                    <span className="truncate">
                                        {workspace.ownerName}
                                    </span>
                                </>
                            )}
                        </>
                    ) : null}
                </div>
            </div>
        </article>
    );
}
