"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotebookScope } from "@homeworkcopy/contracts";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountMenu } from "@/features/auth/components/account-menu";
import { LeaveNotebookDialog } from "@/features/collaboration/components/leave-notebook-dialog";
import { useLeaveNotebook } from "@/features/collaboration/hooks/use-sharing";
import { ApiError } from "@/shared/lib/api";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import {
    useCreateWorkspace,
    useDeleteWorkspace,
    useUpdateWorkspace,
    useWorkspaces,
} from "../hooks/use-workspaces";
import { workspaceRoutes } from "../lib/routes";
import type { Workspace } from "../lib/types";
import { DeleteWorkspaceDialog } from "./delete-workspace-dialog";
import { NotebookGrid } from "./notebook-grid";
import { WorkspaceFormDialog } from "./workspace-form-dialog";

type DashboardHomeProps = {
    userName?: string | null;
};

const SCOPES: readonly { value: NotebookScope; label: string }[] = [
    { value: "mine", label: "Mine" },
    { value: "shared", label: "Shared with me" },
];

/**
 * When anything in the shelf was last touched, phrased for a masthead.
 *
 * Returns `null` while the lists are still loading or genuinely empty, so the
 * figure line can leave the slot out rather than print a placeholder dash.
 */
function lastTouched(...lists: readonly (readonly Workspace[] | undefined)[]): string | null {
    const timestamps = lists
        .flatMap((list) => list ?? [])
        .map((notebook) => new Date(notebook.updatedAt).getTime())
        .filter((time) => Number.isFinite(time));

    if (timestamps.length === 0) return null;

    return formatDistanceToNow(new Date(Math.max(...timestamps)), {
        addSuffix: true,
    });
}

/**
 * Filters a tab's notebooks by the search box.
 *
 * The owner's name is searchable on shared notebooks, because "the one Ada
 * shared" is how people remember someone else's notebook.
 */
function filterNotebooks(
    notebooks: Workspace[] | undefined,
    query: string,
): Workspace[] {
    if (!notebooks) return [];

    const needle = query.trim().toLowerCase();
    if (!needle) return notebooks;

    return notebooks.filter((notebook) =>
        [notebook.title, notebook.description ?? "", notebook.ownerName]
            .join(" ")
            .toLowerCase()
            .includes(needle),
    );
}

export function DashboardHome({ userName }: DashboardHomeProps) {
    const router = useRouter();
    const [scope, setScope] = useState<NotebookScope>("mine");
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebouncedValue(search, 200);

    const mine = useWorkspaces("mine");
    const shared = useWorkspaces("shared");
    const active = scope === "mine" ? mine : shared;

    const createWorkspace = useCreateWorkspace();
    const [createOpen, setCreateOpen] = useState(false);
    const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(
        null,
    );
    const [deletingWorkspace, setDeletingWorkspace] =
        useState<Workspace | null>(null);
    const [leavingWorkspace, setLeavingWorkspace] = useState<Workspace | null>(
        null,
    );

    const updateWorkspace = useUpdateWorkspace(editingWorkspace?.id ?? "");
    const deleteWorkspace = useDeleteWorkspace();
    const leaveNotebook = useLeaveNotebook(leavingWorkspace?.id ?? "");

    const filtered = useMemo(
        () => filterNotebooks(active.data, debouncedSearch),
        [active.data, debouncedSearch],
    );

    const greeting = userName?.split(" ")[0] ?? "there";
    const sharedCount = shared.data?.length ?? 0;
    const ownedCount = mine.data?.length ?? 0;
    const activity = lastTouched(mine.data, shared.data);

    return (
        <div className="notebook-canvas min-h-svh">
            {/* Running head. It stays put while the shelf scrolls under it, so
                the page always says which publication you are inside. */}
            <header
                data-print-hidden
                className="sticky top-0 z-20 border-b border-hairline bg-paper/85 backdrop-blur-md"
            >
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
                    <Link
                        href={workspaceRoutes.list}
                        className="marginalia press-underline text-ink"
                    >
                        Homeworkcopy
                    </Link>

                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            className="hidden gap-2 rounded-sm sm:inline-flex"
                            onClick={() => setCreateOpen(true)}
                        >
                            <PlusIcon className="size-4" />
                            New notebook
                        </Button>
                        <AccountMenu />
                    </div>
                </div>
            </header>

            <main
                id="main-content"
                className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-14"
            >
                {/* Masthead. A returning reader does not need the feature tour
                    they already bought — they need to know the state of the
                    shelf, so the copy is replaced by a figure line. */}
                <section className="mb-12">
                    <p className="marginalia">
                        <span className="text-primary">§</span> Welcome back,{" "}
                        {greeting}
                    </p>
                    <h1 className="mt-5 font-display text-[clamp(2.75rem,7vw,4.5rem)] leading-[0.92] font-semibold tracking-[-0.032em]">
                        Your notebooks
                    </h1>

                    <dl className="mt-9 flex flex-wrap items-baseline gap-x-10 gap-y-4 border-t border-hairline pt-5">
                        <div className="flex items-baseline gap-2.5">
                            <dd
                                data-numeric
                                className="font-display text-3xl font-semibold text-primary"
                            >
                                {ownedCount}
                            </dd>
                            <dt className="marginalia">Owned</dt>
                        </div>
                        <div className="flex items-baseline gap-2.5">
                            <dd
                                data-numeric
                                className="font-display text-3xl font-semibold"
                            >
                                {sharedCount}
                            </dd>
                            <dt className="marginalia">Shared with you</dt>
                        </div>
                        {activity ? (
                            <div className="flex items-baseline gap-2.5">
                                <dt className="marginalia">Last edited</dt>
                                <dd className="font-mono text-xs text-graphite">
                                    {activity}
                                </dd>
                            </div>
                        ) : null}
                    </dl>
                </section>

                <Tabs
                    value={scope}
                    onValueChange={(value) => {
                        // The tab list is a fixed pair, so anything else is a
                        // stray event rather than a scope worth honouring.
                        if (value === "mine" || value === "shared") {
                            setScope(value);
                        }
                    }}
                    className="space-y-5"
                >
                    <div className="flex flex-col gap-4 border-b border-hairline pb-4 sm:flex-row sm:items-center sm:justify-between">
                        <TabsList
                            aria-label="Notebook scope"
                            className="h-auto gap-1 rounded-sm bg-transparent p-0"
                        >
                            {SCOPES.map((option) => (
                                <TabsTrigger
                                    key={option.value}
                                    value={option.value}
                                    className="min-h-11 rounded-sm px-4 font-mono text-xs tracking-widest uppercase data-[state=active]:bg-secondary data-[state=active]:shadow-none"
                                >
                                    {option.label}
                                    {option.value === "shared" &&
                                    sharedCount > 0 ? (
                                        <span
                                            data-numeric
                                            className="ml-2 text-primary"
                                        >
                                            {sharedCount}
                                        </span>
                                    ) : null}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        <div className="relative w-full sm:max-w-xs">
                            <SearchIcon
                                aria-hidden
                                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-graphite"
                            />
                            <Input
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Search notebooks"
                                aria-label="Search notebooks"
                                className="min-h-11 rounded-sm border-hairline bg-paper pl-9 font-mono text-xs"
                            />
                        </div>
                    </div>

                    {SCOPES.map((option) => (
                        <TabsContent key={option.value} value={option.value}>
                            <NotebookGrid
                                scope={option.value}
                                notebooks={
                                    option.value === scope ? filtered : []
                                }
                                isLoading={active.isLoading}
                                error={active.error}
                                searchQuery={debouncedSearch}
                                onCreate={() => setCreateOpen(true)}
                                onClearSearch={() => setSearch("")}
                                onEdit={setEditingWorkspace}
                                onDelete={setDeletingWorkspace}
                                onLeave={setLeavingWorkspace}
                            />
                        </TabsContent>
                    ))}
                </Tabs>
            </main>

            <WorkspaceFormDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                isPending={createWorkspace.isPending}
                onSubmit={async (values) => {
                    const workspace = await createWorkspace.mutateAsync(values);
                    router.push(workspaceRoutes.detail(workspace.id));
                }}
            />

            <WorkspaceFormDialog
                open={Boolean(editingWorkspace)}
                onOpenChange={(open) => {
                    if (!open) {
                        setEditingWorkspace(null);
                    }
                }}
                workspace={editingWorkspace}
                isPending={updateWorkspace.isPending}
                onSubmit={async (values) => {
                    await updateWorkspace.mutateAsync(values);
                    setEditingWorkspace(null);
                }}
            />

            <DeleteWorkspaceDialog
                workspace={deletingWorkspace}
                open={Boolean(deletingWorkspace)}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeletingWorkspace(null);
                    }
                }}
                isPending={deleteWorkspace.isPending}
                onConfirm={async () => {
                    if (!deletingWorkspace) {
                        return;
                    }

                    await deleteWorkspace.mutateAsync(deletingWorkspace.id);
                    setDeletingWorkspace(null);
                }}
            />

            <LeaveNotebookDialog
                notebookTitle={leavingWorkspace?.title ?? null}
                open={Boolean(leavingWorkspace)}
                onOpenChange={(open) => {
                    if (!open) {
                        setLeavingWorkspace(null);
                        leaveNotebook.reset();
                    }
                }}
                isPending={leaveNotebook.isPending}
                error={
                    leaveNotebook.error instanceof ApiError
                        ? leaveNotebook.error.message
                        : null
                }
                onConfirm={async () => {
                    if (!leavingWorkspace) {
                        return;
                    }

                    // The dialog stays open on failure so the reason is
                    // readable and the action is still retryable.
                    const left = await leaveNotebook
                        .mutateAsync()
                        .then(() => true)
                        .catch(() => false);

                    if (left) {
                        setLeavingWorkspace(null);
                    }
                }}
            />
        </div>
    );
}
