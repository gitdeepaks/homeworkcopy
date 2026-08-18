import {
    notebookSummarySchema,
    type NotebookScope,
} from "@homeworkcopy/contracts";
import { z } from "zod";
import { apiFetchVoid, apiFetchWithSchema } from "@/shared/lib/api";
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from "./types";

/**
 * Lists the notebooks behind one dashboard tab.
 *
 * @param scope - `mine` for owned notebooks, `shared` for ones shared with you
 */
export function listWorkspaces(scope: NotebookScope = "mine") {
    return apiFetchWithSchema(
        `/api/workspaces?scope=${scope}`,
        z.array(notebookSummarySchema),
    );
}

export function getWorkspace(id: string) {
    return apiFetchWithSchema(
        `/api/workspaces/${id}`,
        notebookSummarySchema,
    );
}

export function createWorkspace(input: CreateWorkspaceInput) {
    return apiFetchWithSchema(`/api/workspaces`, notebookSummarySchema, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function updateWorkspace(id: string, input: UpdateWorkspaceInput) {
    return apiFetchWithSchema(`/api/workspaces/${id}`, notebookSummarySchema, {
        method: "PATCH",
        body: JSON.stringify(input),
    });
}

export function deleteWorkspace(id: string) {
    return apiFetchVoid(`/api/workspaces/${id}`, {
        method: "DELETE",
    });
}
