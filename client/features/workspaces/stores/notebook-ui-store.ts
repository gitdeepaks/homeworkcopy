"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { Citation, SourceSelectionMode } from "@homeworkcopy/contracts";

export type NotebookTab = "sources" | "chat" | "studio";
export const NOTEBOOK_TABS: readonly NotebookTab[] = [
    "sources",
    "chat",
    "studio",
];

export type NotebookPanelLayout = {
    sources: number;
    chat: number;
    studio: number;
};

type NotebookViewState = {
    panelLayout: NotebookPanelLayout;
    sourcesCollapsed: boolean;
    studioCollapsed: boolean;
    mobileTab: NotebookTab;
    sourceSelectionMode: SourceSelectionMode;
    selectedSourceIds: string[];
    activeSourceId: string | null;
    activeCitation: Citation | null;
    citationSequence: Citation[];
    composerDraft: string;
    activeConversationId: string | null;
};

type NotebookUiState = {
    byNotebook: Record<string, NotebookViewState>;
    setPanelLayout: (notebookId: string, layout: NotebookPanelLayout) => void;
    setPanelCollapsed: (
        notebookId: string,
        panel: "sources" | "studio",
        collapsed: boolean,
    ) => void;
    setMobileTab: (notebookId: string, tab: NotebookTab) => void;
    setSourceSelectionMode: (
        notebookId: string,
        mode: SourceSelectionMode,
    ) => void;
    setSelectedSourceIds: (notebookId: string, sourceIds: string[]) => void;
    addSelectedSourceId: (notebookId: string, sourceId: string) => void;
    openSource: (notebookId: string, sourceId: string) => void;
    openCitation: (
        notebookId: string,
        citation: Citation,
        sequence: Citation[],
    ) => void;
    closeSourceViewer: (notebookId: string) => void;
    setComposerDraft: (notebookId: string, draft: string) => void;
    setActiveConversationId: (
        notebookId: string,
        conversationId: string | null,
    ) => void;
};

export const DEFAULT_NOTEBOOK_VIEW_STATE: NotebookViewState = {
    panelLayout: { sources: 22, chat: 52, studio: 26 },
    sourcesCollapsed: false,
    studioCollapsed: false,
    mobileTab: "chat",
    sourceSelectionMode: "all-ready",
    selectedSourceIds: [],
    activeSourceId: null,
    activeCitation: null,
    citationSequence: [],
    composerDraft: "",
    activeConversationId: null,
};

const serverStorage: StateStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
};

function viewStateFor(
    byNotebook: Record<string, NotebookViewState>,
    notebookId: string,
) {
    return byNotebook[notebookId] ?? DEFAULT_NOTEBOOK_VIEW_STATE;
}

function updateNotebook(
    state: NotebookUiState,
    notebookId: string,
    update: Partial<NotebookViewState>,
) {
    return {
        byNotebook: {
            ...state.byNotebook,
            [notebookId]: {
                ...viewStateFor(state.byNotebook, notebookId),
                ...update,
            },
        },
    };
}

export function selectNotebookViewState(
    state: NotebookUiState,
    notebookId: string,
) {
    return viewStateFor(state.byNotebook, notebookId);
}

export const useNotebookUiStore = create<NotebookUiState>()(
    persist(
        (set) => ({
            byNotebook: {},
            setPanelLayout: (notebookId, panelLayout) =>
                set((state) => updateNotebook(state, notebookId, { panelLayout })),
            setPanelCollapsed: (notebookId, panel, collapsed) =>
                set((state) =>
                    updateNotebook(state, notebookId, {
                        [panel === "sources"
                            ? "sourcesCollapsed"
                            : "studioCollapsed"]: collapsed,
                    }),
                ),
            setMobileTab: (notebookId, mobileTab) =>
                set((state) => updateNotebook(state, notebookId, { mobileTab })),
            setSourceSelectionMode: (notebookId, sourceSelectionMode) =>
                set((state) =>
                    updateNotebook(state, notebookId, { sourceSelectionMode }),
                ),
            setSelectedSourceIds: (notebookId, selectedSourceIds) =>
                set((state) =>
                    updateNotebook(state, notebookId, {
                        selectedSourceIds: [...new Set(selectedSourceIds)],
                    }),
                ),
            addSelectedSourceId: (notebookId, sourceId) =>
                set((state) => {
                    const current = viewStateFor(state.byNotebook, notebookId);
                    if (current.sourceSelectionMode === "all-ready") {
                        return state;
                    }
                    return updateNotebook(state, notebookId, {
                        selectedSourceIds: [...new Set([...current.selectedSourceIds, sourceId])],
                    });
                }),
            openSource: (notebookId, activeSourceId) =>
                set((state) =>
                    updateNotebook(state, notebookId, {
                        activeSourceId,
                        activeCitation: null,
                        citationSequence: [],
                    }),
                ),
            openCitation: (notebookId, activeCitation, citationSequence) =>
                set((state) =>
                    updateNotebook(state, notebookId, {
                        activeSourceId:
                            activeCitation.kind === "source"
                                ? activeCitation.sourceId
                                : null,
                        activeCitation,
                        citationSequence,
                    }),
                ),
            closeSourceViewer: (notebookId) =>
                set((state) =>
                    updateNotebook(state, notebookId, {
                        activeSourceId: null,
                        activeCitation: null,
                        citationSequence: [],
                    }),
                ),
            setComposerDraft: (notebookId, composerDraft) =>
                set((state) => updateNotebook(state, notebookId, { composerDraft })),
            setActiveConversationId: (notebookId, activeConversationId) =>
                set((state) =>
                    updateNotebook(state, notebookId, { activeConversationId }),
                ),
        }),
        {
            name: "homeworkcopy-notebook-ui-v1",
            storage: createJSONStorage(() =>
                typeof window === "undefined" ? serverStorage : localStorage,
            ),
            skipHydration: true,
            partialize: (state) => ({
                byNotebook: Object.fromEntries(
                    Object.entries(state.byNotebook).map(([notebookId, view]) => [
                        notebookId,
                        {
                            panelLayout: view.panelLayout,
                            sourcesCollapsed: view.sourcesCollapsed,
                            studioCollapsed: view.studioCollapsed,
                            mobileTab: view.mobileTab,
                            sourceSelectionMode: view.sourceSelectionMode,
                            selectedSourceIds: view.selectedSourceIds,
                            activeSourceId: null,
                            activeCitation: null,
                            citationSequence: [],
                            composerDraft: "",
                            activeConversationId: view.activeConversationId,
                        },
                    ]),
                ),
            }),
        },
    ),
);
