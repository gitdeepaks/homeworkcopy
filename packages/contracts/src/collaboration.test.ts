import { describe, expect, test } from "bun:test";
import {
    acceptShareResponseSchema,
    auditEventContextSchema,
    createShareLinkRequestSchema,
    hasNotebookPermission,
    invitationRejectionReason,
    inviteMemberRequestSchema,
    notebookPermissionSchema,
    notebookRoleSchema,
    notebookSummarySchema,
    permissionsForRole,
    readAuditEventContext,
    ROLE_PERMISSIONS,
    shareLinkRejectionReason,
    shareTokenSchema,
    SHARE_LINKS_ARE_INDEXABLE,
    SHARE_LINK_MAX_TTL_DAYS,
    SHARE_REJECTION_MESSAGES,
    shareRejectionReasonSchema,
    type NotebookPermission,
    type NotebookRole,
} from "./index";

const ROLES = notebookRoleSchema.options;
const PERMISSIONS = notebookPermissionSchema.options;

describe("role matrix", () => {
    test("every role has an entry", () => {
        for (const role of ROLES) {
            expect(ROLE_PERMISSIONS[role]).toBeInstanceOf(Set);
        }
    });

    test("the owner holds every permission", () => {
        for (const permission of PERMISSIONS) {
            expect(hasNotebookPermission("OWNER", permission)).toBe(true);
        }
    });

    test("a viewer can only read, and take away a copy of what they read", () => {
        expect(permissionsForRole("VIEWER")).toEqual([
            "member:read",
            "notebook:export",
            "notebook:read",
        ]);
    });

    test("an editor can change notebook content but not who reaches it", () => {
        const granted: NotebookPermission[] = [
            "source:create",
            "source:delete",
            "source:reprocess",
            "chat:write",
            "conversation:manage",
            "output:create",
            "output:update",
            "output:delete",
            "output:download",
            "note:create",
            "note:update",
            "note:delete",
        ];
        for (const permission of granted) {
            expect(hasNotebookPermission("EDITOR", permission)).toBe(true);
        }

        const withheld: NotebookPermission[] = [
            "notebook:update",
            "notebook:delete",
            "notebook:transfer",
            "member:manage",
            "share:manage",
            "audit:read",
        ];
        for (const permission of withheld) {
            expect(hasNotebookPermission("EDITOR", permission)).toBe(false);
        }
    });

    test("a viewer never gets a write permission an editor has", () => {
        for (const permission of PERMISSIONS) {
            if (hasNotebookPermission("VIEWER", permission)) {
                expect(hasNotebookPermission("EDITOR", permission)).toBe(true);
            }
        }
    });

    test("roles are strictly nested: viewer ⊆ editor ⊆ owner", () => {
        const nesting: [NotebookRole, NotebookRole][] = [
            ["VIEWER", "EDITOR"],
            ["EDITOR", "OWNER"],
        ];
        for (const [narrow, wide] of nesting) {
            for (const permission of ROLE_PERMISSIONS[narrow]) {
                expect(ROLE_PERMISSIONS[wide].has(permission)).toBe(true);
            }
        }
    });

    test("a viewer cannot write into shared conversation history", () => {
        expect(hasNotebookPermission("VIEWER", "chat:write")).toBe(false);
        expect(hasNotebookPermission("VIEWER", "conversation:manage")).toBe(
            false,
        );
    });

    test("every declared permission is reachable by some role", () => {
        for (const permission of PERMISSIONS) {
            const holders = ROLES.filter((role) =>
                hasNotebookPermission(role, permission),
            );
            expect(holders.length).toBeGreaterThan(0);
        }
    });
});

describe("invitationRejectionReason", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    const future = new Date("2026-08-25T12:00:00.000Z");
    const past = new Date("2026-08-11T12:00:00.000Z");

    test("accepts a live pending invitation", () => {
        expect(
            invitationRejectionReason(
                { status: "PENDING", expiresAt: future },
                now,
            ),
        ).toBeNull();
    });

    test("rejects a revoked invitation", () => {
        expect(
            invitationRejectionReason(
                { status: "REVOKED", expiresAt: future },
                now,
            ),
        ).toBe("REVOKED");
    });

    test("rejects an already-accepted invitation as invalid", () => {
        expect(
            invitationRejectionReason(
                { status: "ACCEPTED", expiresAt: future },
                now,
            ),
        ).toBe("INVALID");
    });

    test("rejects an expired invitation", () => {
        expect(
            invitationRejectionReason(
                { status: "PENDING", expiresAt: past },
                now,
            ),
        ).toBe("EXPIRED");
    });

    test("treats the expiry instant itself as expired", () => {
        expect(
            invitationRejectionReason({ status: "PENDING", expiresAt: now }, now),
        ).toBe("EXPIRED");
    });

    test("revocation outranks expiry", () => {
        expect(
            invitationRejectionReason({ status: "REVOKED", expiresAt: past }, now),
        ).toBe("REVOKED");
    });
});

describe("shareLinkRejectionReason", () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    const future = new Date("2026-09-18T12:00:00.000Z");
    const past = new Date("2026-07-18T12:00:00.000Z");

    test("accepts a live link", () => {
        expect(
            shareLinkRejectionReason({ revokedAt: null, expiresAt: future }, now),
        ).toBeNull();
    });

    test("rejects a revoked link even before it expires", () => {
        expect(
            shareLinkRejectionReason(
                { revokedAt: past, expiresAt: future },
                now,
            ),
        ).toBe("REVOKED");
    });

    test("rejects an expired link", () => {
        expect(
            shareLinkRejectionReason({ revokedAt: null, expiresAt: past }, now),
        ).toBe("EXPIRED");
    });

    test("every link carries an expiry, so none can live forever", () => {
        expect(SHARE_LINK_MAX_TTL_DAYS).toBeLessThanOrEqual(90);
    });

    test("share links are never indexable", () => {
        expect(SHARE_LINKS_ARE_INDEXABLE).toBe(false);
    });
});

describe("share rejection copy", () => {
    test("every reason has a message", () => {
        for (const reason of shareRejectionReasonSchema.options) {
            expect(SHARE_REJECTION_MESSAGES[reason].length).toBeGreaterThan(0);
        }
    });
});

describe("shareTokenSchema", () => {
    test("accepts a url-safe base64 token", () => {
        expect(
            shareTokenSchema.safeParse("a".repeat(43) + "_-").success,
        ).toBe(true);
    });

    test("rejects a token that is too short to be unguessable", () => {
        expect(shareTokenSchema.safeParse("abc").success).toBe(false);
    });

    test("rejects path traversal and query injection attempts", () => {
        for (const token of ["../".repeat(12), "a".repeat(40) + "?x=1", "a".repeat(40) + "/b"]) {
            expect(shareTokenSchema.safeParse(token).success).toBe(false);
        }
    });
});

describe("inviteMemberRequestSchema", () => {
    test("normalizes the email so one person cannot hold two invitations", () => {
        const parsed = inviteMemberRequestSchema.parse({
            email: "  Reader@Example.COM ",
            role: "VIEWER",
        });
        expect(parsed.email).toBe("reader@example.com");
    });

    test("refuses to invite someone straight to owner", () => {
        expect(
            inviteMemberRequestSchema.safeParse({
                email: "reader@example.com",
                role: "OWNER",
            }).success,
        ).toBe(false);
    });
});

describe("createShareLinkRequestSchema", () => {
    test("defaults to the maximum lifetime", () => {
        expect(createShareLinkRequestSchema.parse({}).expiresInDays).toBe(
            SHARE_LINK_MAX_TTL_DAYS,
        );
    });

    test("refuses a lifetime beyond the cap", () => {
        expect(
            createShareLinkRequestSchema.safeParse({
                expiresInDays: SHARE_LINK_MAX_TTL_DAYS + 1,
            }).success,
        ).toBe(false);
    });
});

describe("audit context", () => {
    test("keeps identifiers and roles", () => {
        const context = auditEventContextSchema.parse({
            targetUserId: "user-2",
            fromRole: "VIEWER",
            toRole: "EDITOR",
        });
        expect(context.toRole).toBe("EDITOR");
    });

    test("drops unknown fields rather than persisting them", () => {
        const context = auditEventContextSchema.parse({
            targetUserId: "user-2",
            sourceText: "the whole chapter",
        });
        expect(context).toEqual({ targetUserId: "user-2" });
    });

    test("reads an unusable column as an empty context", () => {
        expect(readAuditEventContext(null)).toEqual({});
        expect(readAuditEventContext(undefined)).toEqual({});
        expect(readAuditEventContext({ fromRole: "ADMIN" })).toEqual({});
    });
});

describe("notebookSummarySchema", () => {
    const base = {
        id: "ws-1",
        title: "Thermodynamics",
        description: null,
        icon: null,
        defaultModel: "gpt-4o-mini",
        createdAt: "2026-08-18T12:00:00.000Z",
        updatedAt: "2026-08-18T12:00:00.000Z",
        role: "VIEWER",
        audience: "shared",
        memberCount: 2,
        ownerName: "Ada",
    };

    test("accepts a shared notebook", () => {
        expect(notebookSummarySchema.parse(base).role).toBe("VIEWER");
    });

    test("requires at least one member, since the owner always counts", () => {
        expect(
            notebookSummarySchema.safeParse({ ...base, memberCount: 0 }).success,
        ).toBe(false);
    });
});

describe("acceptShareResponseSchema", () => {
    test("never reports the accepting user as owner", () => {
        expect(
            acceptShareResponseSchema.safeParse({
                workspaceId: "ws-1",
                workspaceTitle: "Thermodynamics",
                role: "OWNER",
            }).success,
        ).toBe(false);
    });
});
