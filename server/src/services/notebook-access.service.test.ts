import { describe, expect, test } from "bun:test";
import {
    notebookPermissionSchema,
    notebookRoleSchema,
    type NotebookPermission,
} from "@homeworkcopy/contracts";
import {
    effectiveNotebookRole,
    FORBIDDEN_MESSAGES,
} from "./notebook-access.service.js";

describe("effectiveNotebookRole", () => {
    test("the owner is the owner, whatever else is on file", () => {
        expect(
            effectiveNotebookRole({
                ownerId: "user-1",
                userId: "user-1",
                membershipRole: null,
            }),
        ).toBe("OWNER");
    });

    test("a stray membership row can never demote the owner", () => {
        expect(
            effectiveNotebookRole({
                ownerId: "user-1",
                userId: "user-1",
                membershipRole: "VIEWER",
            }),
        ).toBe("OWNER");
    });

    test("a member gets exactly the role they were granted", () => {
        expect(
            effectiveNotebookRole({
                ownerId: "user-1",
                userId: "user-2",
                membershipRole: "EDITOR",
            }),
        ).toBe("EDITOR");

        expect(
            effectiveNotebookRole({
                ownerId: "user-1",
                userId: "user-2",
                membershipRole: "VIEWER",
            }),
        ).toBe("VIEWER");
    });

    test("a stranger gets no role at all", () => {
        expect(
            effectiveNotebookRole({
                ownerId: "user-1",
                userId: "user-3",
                membershipRole: null,
            }),
        ).toBeNull();
    });

    test("a removed member loses access on the very next request", () => {
        const before = effectiveNotebookRole({
            ownerId: "user-1",
            userId: "user-2",
            membershipRole: "EDITOR",
        });
        const after = effectiveNotebookRole({
            ownerId: "user-1",
            userId: "user-2",
            membershipRole: null,
        });

        expect(before).toBe("EDITOR");
        expect(after).toBeNull();
    });

    test("never invents a role outside the contract", () => {
        const roles = notebookRoleSchema.options;
        for (const membershipRole of ["EDITOR", "VIEWER", null] as const) {
            const role = effectiveNotebookRole({
                ownerId: "user-1",
                userId: "user-2",
                membershipRole,
            });
            if (role !== null) {
                expect(roles).toContain(role);
            }
        }
    });
});

describe("FORBIDDEN_MESSAGES", () => {
    test("every permission can explain its own refusal", () => {
        for (const permission of notebookPermissionSchema.options) {
            expect(FORBIDDEN_MESSAGES[permission].length).toBeGreaterThan(0);
        }
    });

    test("no message leaks another person's identity", () => {
        const messages = Object.values(FORBIDDEN_MESSAGES);
        for (const message of messages) {
            expect(message).not.toContain("@");
        }
    });

    test("owner-only actions say so", () => {
        const ownerOnly: NotebookPermission[] = [
            "notebook:update",
            "notebook:delete",
            "notebook:transfer",
            "member:manage",
            "share:manage",
            "audit:read",
        ];
        for (const permission of ownerOnly) {
            expect(FORBIDDEN_MESSAGES[permission]).toContain("owner");
        }
    });
});
