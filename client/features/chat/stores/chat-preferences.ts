"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GroundingMode } from "@homeworkcopy/contracts";

export const CHAT_MODELS = ["gpt-4o-mini", "gpt-4o"] as const;
export type ChatModelId = (typeof CHAT_MODELS)[number];

export const CHAT_MODEL_LABELS: Record<ChatModelId, string> = {
    "gpt-4o-mini": "GPT-4o mini",
    "gpt-4o": "GPT-4o",
};

export function isChatModelId(model: string | null): model is ChatModelId {
    return CHAT_MODELS.some((candidate) => candidate === model);
}

type StoredWorkspaceChatPrefs = {
    model: ChatModelId;
    groundingMode?: GroundingMode | undefined;
    webSearch?: boolean | undefined;
};

type WorkspaceChatPrefs = {
    model: ChatModelId;
    groundingMode: GroundingMode;
};

type ChatPreferencesState = {
    byWorkspace: Record<string, StoredWorkspaceChatPrefs>;
    getPrefs: (
        workspaceId: string,
        defaultModel?: string,
    ) => WorkspaceChatPrefs;
    setModel: (workspaceId: string, model: ChatModelId) => void;
    setGroundingMode: (workspaceId: string, mode: GroundingMode) => void;
};

function resolveModel(model?: string): ChatModelId {
    if (model && isChatModelId(model)) {
        return model;
    }

    return "gpt-4o-mini";
}

export const useChatPreferences = create<ChatPreferencesState>()(
    persist(
        (set, get) => ({
            byWorkspace: {},
            getPrefs: (workspaceId, defaultModel) => {
                const existing = get().byWorkspace[workspaceId];
                if (existing) {
                    return {
                        model: existing.model,
                        groundingMode:
                            existing.groundingMode ??
                            (existing.webSearch ? "notebook-web" : "notebook"),
                    };
                }

                return {
                    model: resolveModel(defaultModel),
                    groundingMode: "notebook",
                };
            },
            setModel: (workspaceId, model) =>
                set((state) => ({
                    byWorkspace: {
                        ...state.byWorkspace,
                        [workspaceId]: {
                            ...state.getPrefs(workspaceId),
                            model,
                        },
                    },
                })),
            setGroundingMode: (workspaceId, groundingMode) =>
                set((state) => ({
                    byWorkspace: {
                        ...state.byWorkspace,
                        [workspaceId]: {
                            ...state.getPrefs(workspaceId),
                            groundingMode,
                            webSearch: undefined,
                        },
                    },
                })),
        }),
        {
            name: "chaibook-chat-preferences",
            skipHydration: true,
        },
    ),
);
