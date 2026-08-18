"use client";

import type { NotebookScope } from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import {
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/shared/lib/api";
import { CreateWorkspaceCard } from "./create-workspace-card";
import { WorkspaceCard } from "./workspace-card";
import type { Workspace } from "../lib/types";

type NotebookGridProps = {
    scope: NotebookScope;
    notebooks: Workspace[] | undefined;
    isLoading: boolean;
    error: unknown;
    /** `null` when the query returned nothing at all, rather than a bad search. */
    searchQuery: string;
    onCreate: () => void;
    onClearSearch: () => void;
    onEdit: (workspace: Workspace) => void;
    onDelete: (workspace: Workspace) => void;
    onLeave: (workspace: Workspace) => void;
};

/**
 * One dashboard tab's notebooks, with every state it can be in.
 *
 * Shared with the Mine tab so both behave identically; the only difference is
 * that Shared has nothing to create, which is why the create card is scoped.
 */
export function NotebookGrid({
    scope,
    notebooks,
    isLoading,
    error,
    searchQuery,
    onCreate,
    onClearSearch,
    onEdit,
    onDelete,
    onLeave,
}: NotebookGridProps) {
    if (isLoading) {
        return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton
                        key={index}
                        className="min-h-[196px] rounded-3xl"
                    />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <Empty className="rounded-3xl border bg-card">
                <EmptyHeader>
                    <EmptyTitle>Could not load notebooks</EmptyTitle>
                    <EmptyDescription>
                        {error instanceof ApiError
                            ? error.message
                            : "Please try again in a moment."}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    const all = notebooks ?? [];
    const hasSearch = searchQuery.trim().length > 0;

    if (scope === "shared" && all.length === 0 && !hasSearch) {
        return (
            <Empty className="rounded-3xl border bg-card">
                <EmptyHeader>
                    <EmptyTitle>Nothing shared with you yet</EmptyTitle>
                    <EmptyDescription>
                        When someone invites you to their notebook, it will
                        appear here.
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    if (all.length === 0 && hasSearch) {
        return (
            <Empty className="rounded-3xl border bg-card">
                <EmptyHeader>
                    <EmptyTitle>No notebooks found</EmptyTitle>
                    <EmptyDescription>
                        Try a different search term.
                    </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button onClick={onClearSearch}>Clear search</Button>
                </EmptyContent>
            </Empty>
        );
    }

    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scope === "mine" ? (
                <CreateWorkspaceCard onClick={onCreate} />
            ) : null}

            {all.map((workspace) => (
                <WorkspaceCard
                    key={workspace.id}
                    workspace={workspace}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onLeave={onLeave}
                />
            ))}
        </div>
    );
}
