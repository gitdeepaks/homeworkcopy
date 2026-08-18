import {
    hasNotebookPermission,
    type NotebookPermission,
    type NotebookRole,
} from "@homeworkcopy/contracts";

/**
 * Whether the current reader may perform an action in this notebook.
 *
 * The client reads the same matrix the server enforces, so a control is hidden
 * for exactly the reason the request behind it would be refused. This is a
 * usability layer, never a security one: the server re-checks every call, and a
 * client that skipped this would simply see `403` instead.
 *
 * `undefined` means the notebook has not loaded yet, and everything is treated as
 * not-yet-permitted so controls cannot flash enabled before the role is known.
 *
 * @param role - The reader's role, or `undefined` while loading
 * @param permission - The action being offered
 * @returns Whether to enable the control
 */
export function can(
    role: NotebookRole | undefined,
    permission: NotebookPermission,
): boolean {
    return role === undefined
        ? false
        : hasNotebookPermission(role, permission);
}

/** How a role is described to the person holding it. */
export const ROLE_LABELS: Readonly<Record<NotebookRole, string>> = {
    OWNER: "Owner",
    EDITOR: "Editor",
    VIEWER: "Viewer",
};

/** What each role can do, in one line, for the share dialog. */
export const ROLE_DESCRIPTIONS: Readonly<Record<NotebookRole, string>> = {
    OWNER: "Full access, including sharing and deletion",
    EDITOR: "Can add sources, chat, and create outputs",
    VIEWER: "Can read sources, chats, and outputs",
};
