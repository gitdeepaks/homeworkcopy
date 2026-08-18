import type { NotebookScope, NotebookSummary } from "@homeworkcopy/contracts";

/**
 * A notebook as the dashboard and shell see it.
 *
 * Since Phase 10 this carries the reader's own role, how widely the notebook is
 * shared, and who owns it, so a shared notebook can be rendered honestly without
 * a second request.
 */
export type Workspace = NotebookSummary;

export type { NotebookScope };

export type CreateWorkspaceInput = {
    title: string;
    description?: string;
    icon?: string;
    defaultModel?: string;
};

export type UpdateWorkspaceInput = Partial<CreateWorkspaceInput>;
