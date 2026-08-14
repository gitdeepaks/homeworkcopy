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
});
