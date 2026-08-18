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
import { Badge } from "@/components/ui/badge";
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
    const href = workspaceRoutes.detail(workspace.id);
    return (
        <article
            className={cn(
                "paper-sheet group/card relative min-h-[196px] overflow-hidden rounded-md transition-all hover:-translate-y-0.5 hover:shadow-lg",
                className,
            )}
        >
            <Link
                href={href}
                className={cn(
                    "absolute inset-0 z-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                )}
                aria-label={`Open ${workspace.title}`}
            />

            <div className="pointer-events-none absolute inset-x-0 top-0 h-2 bg-sticky-blue" />
            <div className="pointer-events-none absolute inset-y-0 left-10 w-px bg-[var(--margin-line)]" />

            <div className="pointer-events-none relative flex h-full min-h-[196px] flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                    <span className="flex size-11 items-center justify-center rounded-md bg-sticky-yellow text-2xl shadow-sm">
                        {workspace.icon ?? "📚"}
                    </span>

                    <div
                        className="pointer-events-auto relative z-10"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                    >
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="size-11 bg-paper/80 text-foreground hover:bg-accent"
                                    />
                                }
                            >
                                <MoreHorizontalIcon />
                                <span className="sr-only">Open menu</span>
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
                </div>

                <div className="mt-auto space-y-1.5 pt-8 pl-8 text-foreground">
                    <h3 className="line-clamp-2 font-heading text-2xl font-bold leading-snug">
                        {workspace.title}
                    </h3>
                    {workspace.description ? (
                        <p className="line-clamp-2 text-sm text-muted-foreground">
                            {workspace.description}
                        </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                        Updated{" "}
                        {formatDistanceToNow(new Date(workspace.updatedAt), {
                            addSuffix: true,
                        })}
                    </p>
                    {workspace.audience === "shared" ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Badge variant="secondary" className="gap-1">
                                <UsersIcon aria-hidden className="size-3" />
                                {workspace.memberCount} people
                            </Badge>
                            {/* The role is text, not only a colour, so it
                                survives greyscale and screen readers alike. */}
                            <Badge variant="outline">
                                {ROLE_LABELS[workspace.role]}
                            </Badge>
                            {workspace.role === "OWNER" ? null : (
                                <span className="text-xs text-muted-foreground">
                                    Shared by {workspace.ownerName}
                                </span>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>
        </article>
    );
}
