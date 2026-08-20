"use client";

import type { NotebookScope } from "@homeworkcopy/contracts";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/shared/lib/errors";
import { CreateWorkspaceCard } from "./create-workspace-card";
import { WorkspaceCard } from "./workspace-card";
import type { Workspace } from "../lib/types";

type NotebookGridProps = {
    scope: NotebookScope;
    notebooks: Workspace[] | undefined;
    isLoading: boolean;
    /**
     * The query's own error. React Query narrows this to `Error` for us, so it
     * arrives already typed rather than as something to interrogate.
     */
    error: Error | null;
    /** Empty when the tab is genuinely empty rather than filtered to nothing. */
    searchQuery: string;
    onCreate: () => void;
    onClearSearch: () => void;
    onEdit: (workspace: Workspace) => void;
    onDelete: (workspace: Workspace) => void;
    onLeave: (workspace: Workspace) => void;
};

/** A ruled-off notice, used for every state that is not a shelf of notebooks. */
function Notice({
    title,
    body,
    action,
}: {
    title: string;
    body: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="border-t border-hairline py-16 text-center">
            <h3 className="font-display text-2xl font-semibold tracking-tight">
                {title}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-graphite">
                {body}
            </p>
            {action ? <div className="mt-6">{action}</div> : null}
        </div>
    );
}

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
                    <div
                        key={index}
                        aria-hidden="true"
                        className="min-h-[13rem] animate-pulse rounded-sm border border-hairline bg-paper/60"
                    />
                ))}
                <span className="sr-only" role="status">
                    Loading notebooks
                </span>
            </div>
        );
    }

    if (error) {
        return (
            <Notice
                title="Could not load notebooks"
                body={errorMessage(error, "Please try again in a moment.")}
            />
        );
    }

    const all = notebooks ?? [];
    const hasSearch = searchQuery.trim().length > 0;

    if (all.length === 0 && hasSearch) {
        return (
            <Notice
                title="Nothing matched"
                body={`No notebook here mentions “${searchQuery.trim()}”.`}
                action={
                    <Button
                        variant="outline"
                        className="rounded-sm"
                        onClick={onClearSearch}
                    >
                        Clear search
                    </Button>
                }
            />
        );
    }

    if (scope === "shared" && all.length === 0) {
        return (
            <Notice
                title="Nothing shared with you yet"
                body="When someone invites you to their notebook, it appears on this shelf."
            />
        );
    }

    return (
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
