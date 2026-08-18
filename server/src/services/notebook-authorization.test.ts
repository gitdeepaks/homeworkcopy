/**
 * The role matrix, exercised through the real authorization path.
 *
 * The contracts package proves the matrix is internally consistent; this proves
 * every notebook resource is actually wired to it. Denials short-circuit before
 * any database work, so only the two lookups the access layer performs are
 * stubbed — everything below them is the shipping code path.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
    NotebookMemberRole,
    NotebookPermission,
} from "@homeworkcopy/contracts";
import { ForbiddenError, NotFoundError } from "../types/app-error.js";

type Membership = { role: NotebookMemberRole } | null;

const OWNER_ID = "user-owner";
const READER_ID = "user-reader";
const STRANGER_ID = "user-stranger";
const WORKSPACE_ID = "ws-1";

let membership: Membership = null;

const workspaceRow = {
    id: WORKSPACE_ID,
    userId: OWNER_ID,
    title: "Thermodynamics",
    description: null,
    icon: null,
    defaultModel: "gpt-4o-mini",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    user: {
        id: OWNER_ID,
        name: "Ada",
        email: "ada@example.com",
        image: null,
    },
};

void mock.module("../repositories/workspace.repository.js", () => ({
    findWorkspaceWithOwnerById: () => Promise.resolve(workspaceRow),
}));

void mock.module("../repositories/notebook-member.repository.js", () => ({
    findNotebookMember: () => Promise.resolve(membership),
}));

const { authorizeNotebook, resolveNotebookAccess } = await import(
    "./notebook-access.service.js"
);

/** Every mutation a notebook exposes, and the permission it must require. */
const MUTATIONS: readonly (readonly [string, NotebookPermission])[] = [
    ["add a source", "source:create"],
    ["remove a source", "source:delete"],
    ["reprocess a source", "source:reprocess"],
    ["send a chat message", "chat:write"],
    ["manage conversations", "conversation:manage"],
    ["create an output", "output:create"],
    ["edit an output", "output:update"],
    ["delete an output", "output:delete"],
    ["download output media", "output:download"],
    ["write a note", "note:create"],
    ["edit a note", "note:update"],
    ["delete a note", "note:delete"],
    ["change notebook settings", "notebook:update"],
    ["delete the notebook", "notebook:delete"],
    ["transfer the notebook", "notebook:transfer"],
    ["manage members", "member:manage"],
    ["change sharing", "share:manage"],
    ["read the activity trail", "audit:read"],
];

/** What only the owner may do. */
const OWNER_ONLY: ReadonlySet<NotebookPermission> = new Set([
    "notebook:update",
    "notebook:delete",
    "notebook:transfer",
    "member:manage",
    "share:manage",
    "audit:read",
]);

/**
 * Runs an authorization attempt and returns whatever came back.
 *
 * Returning the rejection rather than letting it propagate keeps the assertions
 * about the error's type and message, which is what these tests are checking.
 */
async function attempt(
    userId: string,
    permission: NotebookPermission,
): Promise<unknown> {
    try {
        return await authorizeNotebook(WORKSPACE_ID, userId, permission);
    } catch (error) {
        return error;
    }
}

beforeEach(() => {
    membership = null;
});

describe("owner", () => {
    test("may do everything a notebook exposes", async () => {
        for (const [, permission] of MUTATIONS) {
            const access = await authorizeNotebook(
                WORKSPACE_ID,
                OWNER_ID,
                permission,
            );
            expect(access.role).toBe("OWNER");
        }
    });

    test("is the owner without holding a membership row", async () => {
        const access = await resolveNotebookAccess(WORKSPACE_ID, OWNER_ID);
        expect(access.ownerId).toBe(OWNER_ID);
        expect(access.role).toBe("OWNER");
    });
});

describe("editor", () => {
    beforeEach(() => {
        membership = { role: "EDITOR" };
    });

    test("may change notebook content", async () => {
        for (const [action, permission] of MUTATIONS) {
            if (OWNER_ONLY.has(permission)) continue;
            const result = await attempt(READER_ID, permission);
            expect(result, `editor was refused: ${action}`).not.toBeInstanceOf(
                Error,
            );
        }
    });

    test("may not change who reaches the notebook", async () => {
        for (const [action, permission] of MUTATIONS) {
            if (!OWNER_ONLY.has(permission)) continue;
            const result = await attempt(READER_ID, permission);
            expect(result, `editor was allowed to ${action}`).toBeInstanceOf(
                ForbiddenError,
            );
        }
    });
});

describe("viewer", () => {
    beforeEach(() => {
        membership = { role: "VIEWER" };
    });

    test("may read the notebook and its members", async () => {
        for (const permission of ["notebook:read", "member:read"] as const) {
            const access = await authorizeNotebook(
                WORKSPACE_ID,
                READER_ID,
                permission,
            );
            expect(access.role).toBe("VIEWER");
        }
    });

    test("is refused every mutation, on every resource", async () => {
        for (const [action, permission] of MUTATIONS) {
            const result = await attempt(READER_ID, permission);
            expect(result, `viewer was allowed to ${action}`).toBeInstanceOf(
                ForbiddenError,
            );
        }
    });

    test("is told what their role cannot do, not merely 'forbidden'", async () => {
        const result = await attempt(READER_ID, "source:create");

        expect(result).toBeInstanceOf(ForbiddenError);
        if (!(result instanceof ForbiddenError)) return;
        expect(result.message).toContain("view-only");
        expect(result.statusCode).toBe(403);
    });
});

describe("a user with no membership", () => {
    test("cannot tell the notebook apart from one that does not exist", async () => {
        const result = await attempt(STRANGER_ID, "notebook:read");

        expect(result).toBeInstanceOf(NotFoundError);
        if (!(result instanceof NotFoundError)) return;
        expect(result.statusCode).toBe(404);
    });

    test("is refused every mutation too", async () => {
        for (const [action, permission] of MUTATIONS) {
            const result = await attempt(STRANGER_ID, permission);
            expect(result, `stranger was allowed to ${action}`).toBeInstanceOf(
                NotFoundError,
            );
        }
    });
});

describe("revocation", () => {
    test("takes effect on the next request, with no session to wait out", async () => {
        membership = { role: "EDITOR" };
        const before = await attempt(READER_ID, "source:create");
        expect(before).not.toBeInstanceOf(Error);

        membership = null;
        const after = await attempt(READER_ID, "source:create");
        expect(after).toBeInstanceOf(NotFoundError);
    });

    test("a downgrade to viewer removes write access immediately", async () => {
        membership = { role: "EDITOR" };
        expect(await attempt(READER_ID, "note:create")).not.toBeInstanceOf(
            Error,
        );

        membership = { role: "VIEWER" };
        expect(await attempt(READER_ID, "note:create")).toBeInstanceOf(
            ForbiddenError,
        );
    });
});
