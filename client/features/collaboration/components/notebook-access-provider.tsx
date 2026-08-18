"use client";

import { createContext, useContext, useMemo } from "react";
import type { NotebookPermission, NotebookRole } from "@homeworkcopy/contracts";
import { can } from "../lib/permissions";

type NotebookAccessValue = {
    role: NotebookRole | undefined;
    can: (permission: NotebookPermission) => boolean;
};

/**
 * The reader's role in the notebook currently on screen.
 *
 * `undefined` outside a notebook, and treated as no-permissions, so a component
 * rendered somewhere unexpected fails closed rather than offering controls it
 * cannot back up.
 */
const NotebookAccessContext = createContext<NotebookAccessValue>({
    role: undefined,
    can: () => false,
});

type NotebookAccessProviderProps = {
    role: NotebookRole;
    children: React.ReactNode;
};

/**
 * Carries the reader's role to every panel inside the notebook shell.
 *
 * A context rather than a prop on each panel: the role is ambient to the whole
 * notebook, and threading it through Sources, Chat, Studio, and Notes
 * separately would leave four places for it to go stale or be forgotten.
 */
export function NotebookAccessProvider({
    role,
    children,
}: NotebookAccessProviderProps) {
    const value = useMemo<NotebookAccessValue>(
        () => ({
            role,
            can: (permission) => can(role, permission),
        }),
        [role],
    );

    return (
        <NotebookAccessContext value={value}>{children}</NotebookAccessContext>
    );
}

/**
 * Reads the reader's role in the current notebook.
 *
 * @returns The role and a permission check bound to it
 */
export function useNotebookAccess(): NotebookAccessValue {
    return useContext(NotebookAccessContext);
}

/**
 * Whether the reader may perform an action in the current notebook.
 *
 * Hides or disables a control for exactly the reason the request behind it would
 * be refused. The server re-checks every call regardless.
 *
 * @param permission - The action being offered
 * @returns Whether to enable the control
 */
export function useNotebookCan(permission: NotebookPermission): boolean {
    return useNotebookAccess().can(permission);
}
