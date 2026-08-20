import { auth } from "@clerk/nextjs/server";
import { notebookSummarySchema } from "@homeworkcopy/contracts";
import type { Workspace } from "./types";

const apiUrl = process.env["API_URL"] ?? "http://localhost:8080";

/**
 * Loads a notebook on the server, as the signed-in reader.
 *
 * The API answers `404` both for a notebook that does not exist and for one this
 * reader has no relationship to, so a stale link to someone else's notebook — or
 * to one they were just removed from — renders the not-found page rather than
 * leaking that it exists.
 *
 * @param id - Notebook id from the route
 * @returns The notebook with the reader's role, or `null` when it is not theirs
 */
async function fetchWorkspace(id: string): Promise<Workspace | null> {
    const { getToken } = await auth();
    const token = await getToken();

    if (!token) {
        throw new Error("Unauthorized");
    }

    const response = await fetch(`${apiUrl}/api/workspaces/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
    });

    if (response.status === 404 || response.status === 403) {
        return null;
    }

    if (!response.ok) {
        throw new Error("Failed to fetch workspace");
    }

    // Parsed rather than trusted: the role in this payload decides which
    // controls render, so a shape mismatch must fail loudly, not silently
    // render a notebook with an undefined role.
    return notebookSummarySchema.parse(await response.json());
}

export async function getWorkspaceOrNull(id: string) {
    return fetchWorkspace(id);
}
