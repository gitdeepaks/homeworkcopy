import { beforeEach, describe, expect, test } from "bun:test";
import {
    DEFAULT_NOTEBOOK_VIEW_STATE,
    selectNotebookViewState,
    useNotebookUiStore,
} from "./notebook-ui-store";

describe("notebook UI store", () => {
    beforeEach(() => {
        useNotebookUiStore.setState({ byNotebook: {} });
    });

    test("isolates view state by notebook", () => {
        const state = useNotebookUiStore.getState();
        state.setMobileTab("notebook-a", "sources");
        state.setComposerDraft("notebook-a", "Question for A");
        state.setComposerDraft("notebook-b", "Question for B");

        const current = useNotebookUiStore.getState();
        expect(selectNotebookViewState(current, "notebook-a").mobileTab).toBe(
            "sources",
        );
        expect(
            selectNotebookViewState(current, "notebook-a").composerDraft,
        ).toBe("Question for A");
        expect(
            selectNotebookViewState(current, "notebook-b").composerDraft,
        ).toBe("Question for B");
    });

    test("returns immutable defaults for a new notebook", () => {
        const state = useNotebookUiStore.getState();
        const view = selectNotebookViewState(state, "new-notebook");

        expect(view).toEqual(DEFAULT_NOTEBOOK_VIEW_STATE);
        expect(selectNotebookViewState(state, "new-notebook")).toBe(view);
        expect(view.mobileTab).toBe("chat");
        expect(view.panelLayout).toEqual({
            sources: 22,
            chat: 52,
            studio: 26,
        });
    });

    test("updates selected sources and panel preferences without mixing them", () => {
        const state = useNotebookUiStore.getState();
        state.setSourceSelectionMode("notebook-a", "custom");
        state.setSelectedSourceIds("notebook-a", [
            "source-1",
            "source-2",
            "source-1",
        ]);
        state.setPanelCollapsed("notebook-a", "studio", true);
        state.setPanelLayout("notebook-a", {
            sources: 24,
            chat: 50,
            studio: 26,
        });

        const view = selectNotebookViewState(
            useNotebookUiStore.getState(),
            "notebook-a",
        );
        expect(view.selectedSourceIds).toEqual(["source-1", "source-2"]);
        expect(view.sourceSelectionMode).toBe("custom");
        expect(view.studioCollapsed).toBe(true);
        expect(view.sourcesCollapsed).toBe(false);
        expect(view.panelLayout.chat).toBe(50);
    });

    test("atomically selects every successfully queued source", () => {
        const state = useNotebookUiStore.getState();
        state.addSelectedSourceId("notebook-a", "source-from-all-ready");
        expect(selectNotebookViewState(useNotebookUiStore.getState(), "notebook-a").sourceSelectionMode)
            .toBe("all-ready");
        useNotebookUiStore.getState().setSourceSelectionMode("notebook-a", "custom");
        state.addSelectedSourceId("notebook-a", "source-1");
        useNotebookUiStore.getState().addSelectedSourceId("notebook-a", "source-2");
        useNotebookUiStore.getState().addSelectedSourceId("notebook-a", "source-1");

        const view = selectNotebookViewState(useNotebookUiStore.getState(), "notebook-a");
        expect(view.sourceSelectionMode).toBe("custom");
        expect(view.selectedSourceIds).toEqual(["source-1", "source-2"]);
    });

    test("opens and closes a citation without changing the chat draft", () => {
        const state = useNotebookUiStore.getState();
        state.setComposerDraft("notebook-a", "Keep this question");
        state.openCitation(
            "notebook-a",
            {
                kind: "source",
                label: "1",
                sourceId: "source-1",
                sourceType: "TEXT",
                title: "Notes",
                excerpt: "Evidence",
                chunkId: "chunk-1",
                chunkIndex: 0,
                provenance: { provider: "postgres" },
            },
            [],
        );

        let view = selectNotebookViewState(
            useNotebookUiStore.getState(),
            "notebook-a",
        );
        expect(view.activeSourceId).toBe("source-1");
        expect(view.composerDraft).toBe("Keep this question");

        useNotebookUiStore.getState().closeSourceViewer("notebook-a");
        view = selectNotebookViewState(
            useNotebookUiStore.getState(),
            "notebook-a",
        );
        expect(view.activeSourceId).toBeNull();
        expect(view.composerDraft).toBe("Keep this question");
    });

    test("keeps the active conversation scoped to its notebook", () => {
        const state = useNotebookUiStore.getState();
        state.setActiveConversationId("notebook-a", "conversation-a");
        state.setActiveConversationId("notebook-b", "conversation-b");

        expect(
            selectNotebookViewState(useNotebookUiStore.getState(), "notebook-a")
                .activeConversationId,
        ).toBe("conversation-a");
        expect(
            selectNotebookViewState(useNotebookUiStore.getState(), "notebook-b")
                .activeConversationId,
        ).toBe("conversation-b");
    });
});
