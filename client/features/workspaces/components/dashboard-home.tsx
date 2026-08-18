"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotebookScope } from "@homeworkcopy/contracts";
import {
    BookOpenIcon,
    MessageSquareIcon,
    SearchIcon,
    SparklesIcon,
} from "lucide-react";
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

const FEATURES = [
    {
        icon: BookOpenIcon,
        title: "Upload sources",
        description: "PDFs, websites, YouTube, and notes in one place",
    },
    {
        icon: MessageSquareIcon,
        title: "Chat with context",
        description: "Ask questions grounded in your materials",
    },
    {
        icon: SparklesIcon,
        title: "Create outputs",
        description:
            "Build flashcards, quizzes, mind maps, and summaries in Studio",
    },
] as const;

const SCOPES: readonly { value: NotebookScope; label: string }[] = [
    { value: "mine", label: "Mine" },
    { value: "shared", label: "Shared with me" },
];

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

    return (
        <div className="notebook-canvas min-h-svh">
            <header
                data-print-hidden
                className="sticky top-0 z-20 border-b bg-paper/90 backdrop-blur-md"
            >
                <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
                    <Link
                        href={workspaceRoutes.list}
                        className="flex min-h-11 items-center font-heading text-2xl font-bold tracking-tight"
                    >
                        <span className="ink-highlight">Homeworkcopy</span>
                    </Link>

                    <AccountMenu />
                </div>
            </header>

            <main
                id="main-content"
                className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-10"
            >
                <section className="mb-10 space-y-6">
                    <div className="space-y-2">
                        <p className="font-heading text-xl font-medium text-primary">
                            Welcome back, {greeting}
                        </p>
                        <h1 className="font-heading text-5xl font-bold tracking-tight md:text-6xl">
                            Your notebooks
                        </h1>
                        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                            Organize sources, chat with your materials, and
                            create outputs, all in one notebook.
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        {FEATURES.map((feature) => (
                            <div
                                key={feature.title}
                                className="paper-tab rounded-r-md p-4 shadow-sm"
                            >
                                <feature.icon className="mb-2 size-4 text-primary" />
                                <p className="text-sm font-medium">
                                    {feature.title}
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>
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
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <TabsList aria-label="Notebook scope">
                            {SCOPES.map((option) => (
                                <TabsTrigger
                                    key={option.value}
                                    value={option.value}
                                    className="min-h-11 px-4"
                                >
                                    {option.label}
                                    {option.value === "shared" &&
                                    sharedCount > 0 ? (
                                        <span className="ml-1 text-xs text-muted-foreground">
                                            {sharedCount}
                                        </span>
                                    ) : null}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        <div className="relative w-full sm:max-w-xs">
                            <SearchIcon
                                aria-hidden
                                className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                            />
                            <Input
                                value={search}
                                onChange={(event) =>
                                    setSearch(event.target.value)
                                }
                                placeholder="Search notebooks..."
                                aria-label="Search notebooks"
                                className="rounded-full bg-background pl-9"
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
