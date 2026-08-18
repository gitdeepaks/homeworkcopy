import { describe, expect, test } from "bun:test";
import {
    notebookPermissionSchema,
    notebookRoleSchema,
    type NotebookPermission,
} from "@homeworkcopy/contracts";
import { can, ROLE_DESCRIPTIONS, ROLE_LABELS } from "./permissions";

describe("can", () => {
    test("treats an unknown role as not-yet-permitted", () => {
        for (const permission of notebookPermissionSchema.options) {
            expect(can(undefined, permission)).toBe(false);
        }
    });

    test("mirrors the server matrix exactly", () => {
        const writes: NotebookPermission[] = [
            "source:create",
            "chat:write",
            "output:create",
            "note:create",
        ];

        for (const permission of writes) {
            expect(can("OWNER", permission)).toBe(true);
            expect(can("EDITOR", permission)).toBe(true);
            expect(can("VIEWER", permission)).toBe(false);
        }
    });

    test("keeps sharing controls to the owner", () => {
        expect(can("OWNER", "share:manage")).toBe(true);
        expect(can("EDITOR", "share:manage")).toBe(false);
        expect(can("VIEWER", "share:manage")).toBe(false);
    });
});

describe("role copy", () => {
    test("every role has a label and a description", () => {
        for (const role of notebookRoleSchema.options) {
            expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
            expect(ROLE_DESCRIPTIONS[role].length).toBeGreaterThan(0);
        }
    });
});
