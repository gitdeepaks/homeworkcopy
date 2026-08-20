"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    ArrowLeftIcon,
    BookOpenIcon,
    GraduationCapIcon,
    MessageSquareIcon,
    PanelLeftCloseIcon,
    PanelRightCloseIcon,
} from "lucide-react";
import { AccountMenu } from "@/features/auth/components/account-menu";
import { WorkspaceChat } from "@/features/chat";
import { useChatPreferences } from "@/features/chat/stores/chat-preferences";
import { NotebookAccessProvider } from "@/features/collaboration";
import { StudioPanel } from "@/features/studio";
import { SourcesPanel } from "@/features/sources/components/sources-panel";
import { SourceViewer } from "@/features/sources/components/source-viewer";
import { Button } from "@/components/ui/button";
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { workspaceRoutes } from "../lib/routes";
import type { Workspace } from "../lib/types";
import {
    NOTEBOOK_TABS,
    selectNotebookViewState,
    useNotebookUiStore,
    type NotebookPanelLayout,
    type NotebookTab,
} from "../stores/notebook-ui-store";
import { WorkspaceHeaderActions } from "./workspace-header-actions";

type WorkspaceShellProps = {
    workspace: Workspace;
    children?: React.ReactNode;
};

const TAB_DETAILS: Record<
    NotebookTab,
    { label: string; icon: typeof BookOpenIcon }
> = {
    sources: { label: "Sources", icon: BookOpenIcon },
    chat: { label: "Chat", icon: MessageSquareIcon },
    studio: { label: "Studio", icon: GraduationCapIcon },
};

function isNotebookRoot(pathname: string, workspaceId: string) {
    return pathname === workspaceRoutes.detail(workspaceId);
}

export function WorkspaceShell({ workspace, children }: WorkspaceShellProps) {
    const pathname = usePathname();
    const [compactLayout, setCompactLayout] = useState(false);
    const tabRefs = useRef<Record<NotebookTab, HTMLButtonElement | null>>({
        sources: null,
        chat: null,
        studio: null,
    });
    const viewState = useNotebookUiStore((state) =>
        selectNotebookViewState(state, workspace.id),
    );
    const setPanelLayout = useNotebookUiStore((state) => state.setPanelLayout);
    const setPanelCollapsed = useNotebookUiStore(
        (state) => state.setPanelCollapsed,
    );
    const setMobileTab = useNotebookUiStore((state) => state.setMobileTab);
    const integrated = isNotebookRoot(pathname, workspace.id);

    useEffect(() => {
        void useNotebookUiStore.persist.rehydrate();
        void useChatPreferences.persist.rehydrate();
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 1023px)");
        const updateLayout = () => setCompactLayout(mediaQuery.matches);
        updateLayout();
        mediaQuery.addEventListener("change", updateLayout);
        return () => mediaQuery.removeEventListener("change", updateLayout);
    }, []);

    function persistLayout(layout: { [id: string]: number }) {
        const panelLayout: NotebookPanelLayout = {
            sources: layout["sources"] ?? viewState.panelLayout.sources,
            chat: layout["chat"] ?? viewState.panelLayout.chat,
            studio: layout["studio"] ?? viewState.panelLayout.studio,
        };
        setPanelLayout(workspace.id, panelLayout);
    }

    return (
        <NotebookAccessProvider role={workspace.role}>
        <div className="notebook-canvas flex h-svh min-h-0 flex-col p-0 md:p-3">
            <div className="ruled-paper flex min-h-0 flex-1 flex-col overflow-hidden rounded-none md:rounded-md">
                <header
                    data-print-hidden
                    className="z-10 flex min-h-14 items-center gap-2 border-b border-hairline bg-paper/85 px-2 backdrop-blur-md sm:px-3"
                >
                    <Button
                        nativeButton={false}
                        variant="ghost"
                        size="icon-sm"
                        className="rounded-sm text-graphite"
                        render={<Link href={workspaceRoutes.list} />}
                    >
                        <ArrowLeftIcon />
                        <span className="sr-only">Back to notebooks</span>
                    </Button>

                    <span
                        aria-hidden="true"
                        className="mx-1 hidden h-5 w-px bg-hairline sm:block"
                    />

                    <span aria-hidden className="text-base">
                        {workspace.icon ?? "§"}
                    </span>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate font-display text-lg font-semibold tracking-[-0.02em] sm:text-xl">
                            {workspace.title}
                        </h1>
                    </div>

                    {/* Panel toggles, set as one segmented control so the two
                        edges of the workspace read as a pair rather than as two
                        unrelated icon buttons. */}
                    {integrated ? (
                        <div className="hidden items-center rounded-sm border border-hairline lg:flex">
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-none rounded-l-sm text-graphite aria-pressed:bg-secondary aria-pressed:text-ink"
                                onClick={() =>
                                    setPanelCollapsed(
                                        workspace.id,
                                        "sources",
                                        !viewState.sourcesCollapsed,
                                    )
                                }
                                aria-pressed={!viewState.sourcesCollapsed}
                            >
                                <PanelLeftCloseIcon />
                                <span className="sr-only">
                                    Toggle Sources panel
                                </span>
                            </Button>
                            <span
                                aria-hidden="true"
                                className="h-5 w-px bg-hairline"
                            />
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-none rounded-r-sm text-graphite aria-pressed:bg-secondary aria-pressed:text-ink"
                                onClick={() =>
                                    setPanelCollapsed(
                                        workspace.id,
                                        "studio",
                                        !viewState.studioCollapsed,
                                    )
                                }
                                aria-pressed={!viewState.studioCollapsed}
                            >
                                <PanelRightCloseIcon />
                                <span className="sr-only">
                                    Toggle Studio panel
                                </span>
                            </Button>
                        </div>
                    ) : null}

                    <WorkspaceHeaderActions workspace={workspace} />
                    <AccountMenu />
                </header>

                <main id="main-content" className="relative flex min-h-0 flex-1 flex-col">
                    {integrated ? (
                        <>
                            <div className="flex min-h-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
                                <ResizablePanelGroup
                                    id={`notebook-${workspace.id}`}
                                    orientation="horizontal"
                                    defaultLayout={viewState.panelLayout}
                                    onLayoutChanged={(layout, meta) => {
                                        if (meta.isUserInteraction) persistLayout(layout);
                                    }}
                                    disabled={compactLayout}
                                    className={cn(
                                        "min-h-0",
                                        compactLayout && "notebook-compact-panels",
                                    )}
                                >
                                    {compactLayout || !viewState.sourcesCollapsed ? (
                                        <>
                                            <ResizablePanel
                                                id="sources"
                                                data-active={viewState.mobileTab === "sources"}
                                                defaultSize={viewState.panelLayout.sources}
                                                minSize={compactLayout ? 0 : "240px"}
                                                maxSize={compactLayout ? "100%" : "320px"}
                                            >
                                                <div id="notebook-sources-panel" role="tabpanel" aria-labelledby="notebook-sources-tab" className="h-full">
                                                    <SourcesPanel workspaceId={workspace.id} />
                                                </div>
                                            </ResizablePanel>
                                            {!compactLayout ? <ResizableHandle withHandle aria-label="Resize Sources panel" /> : null}
                                        </>
                                    ) : null}
                                    <ResizablePanel
                                        id="chat"
                                        data-active={viewState.mobileTab === "chat"}
                                        defaultSize={viewState.panelLayout.chat}
                                        minSize={compactLayout ? 0 : "480px"}
                                        maxSize={compactLayout ? "100%" : undefined}
                                    >
                                        <section id="notebook-chat-panel" role="tabpanel" aria-labelledby="notebook-chat-tab" className="ruled-paper flex h-full min-h-0 flex-col">
                                            <Suspense fallback={null}>
                                                <WorkspaceChat workspaceId={workspace.id} defaultModel={workspace.defaultModel} />
                                            </Suspense>
                                        </section>
                                    </ResizablePanel>
                                    {compactLayout || !viewState.studioCollapsed ? (
                                        <>
                                            {!compactLayout ? <ResizableHandle withHandle aria-label="Resize Studio panel" /> : null}
                                            <ResizablePanel
                                                id="studio"
                                                data-active={viewState.mobileTab === "studio"}
                                                defaultSize={viewState.panelLayout.studio}
                                                minSize={compactLayout ? 0 : "280px"}
                                                maxSize={compactLayout ? "100%" : "360px"}
                                            >
                                                <div id="notebook-studio-panel" role="tabpanel" aria-labelledby="notebook-studio-tab" className="h-full">
                                                    <StudioPanel workspaceId={workspace.id} />
                                                </div>
                                            </ResizablePanel>
                                        </>
                                    ) : null}
                                </ResizablePanelGroup>
                            </div>

                            <div role="tablist" aria-label="Notebook sections" className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(3.5rem+env(safe-area-inset-bottom))] grid-cols-3 border-t border-hairline bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
                                {NOTEBOOK_TABS.map((tab) => {
                                    const details = TAB_DETAILS[tab];
                                    const Icon = details.icon;
                                    const selected = viewState.mobileTab === tab;
                                    return (
                                        <button
                                            key={tab}
                                            id={`notebook-${tab}-tab`}
                                            ref={(element) => {
                                                tabRefs.current[tab] = element;
                                            }}
                                            type="button"
                                            role="tab"
                                            aria-controls={`notebook-${tab}-panel`}
                                            aria-selected={selected}
                                            tabIndex={selected ? 0 : -1}
                                            className={cn(
                                                "relative flex min-h-11 items-center justify-center gap-1.5 px-2 font-mono text-[0.7rem] tracking-widest uppercase transition-colors",
                                                // The selected tab is marked by a
                                                // rule at the edge it belongs to,
                                                // not by a filled block.
                                                "before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:transition-colors",
                                                selected
                                                    ? "font-semibold text-primary before:bg-primary"
                                                    : "text-graphite before:bg-transparent",
                                            )}
                                            onClick={() => setMobileTab(workspace.id, tab)}
                                            onKeyDown={(event) => {
                                                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                                                event.preventDefault();
                                                const currentIndex = NOTEBOOK_TABS.indexOf(tab);
                                                const offset = event.key === "ArrowRight" ? 1 : -1;
                                                const nextIndex = (currentIndex + offset + NOTEBOOK_TABS.length) % NOTEBOOK_TABS.length;
                                                const nextTab = NOTEBOOK_TABS[nextIndex];
                                                if (nextTab) {
                                                    setMobileTab(workspace.id, nextTab);
                                                    tabRefs.current[nextTab]?.focus();
                                                }
                                            }}
                                        >
                                            <Icon className="size-4" />
                                            {details.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <SourceViewer workspaceId={workspace.id} />
                        </>
                    ) : (
                        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
                    )}
                </main>
            </div>
        </div>
        </NotebookAccessProvider>
    );
}
