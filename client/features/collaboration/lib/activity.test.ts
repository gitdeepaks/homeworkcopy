import { describe, expect, test } from "bun:test";
import {
    auditEventTypeSchema,
    type AuditEvent,
} from "@homeworkcopy/contracts";
import { describeAuditEvent } from "./activity";

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
    return {
        id: "evt-1",
        workspaceId: "ws-1",
        type: "MEMBER_INVITED",
        actorUserId: "user-1",
        actorName: "Ada",
        context: {},
        createdAt: "2026-08-18T12:00:00.000Z",
        ...overrides,
    };
}

describe("describeAuditEvent", () => {
    test("every event type has a sentence", () => {
        for (const type of auditEventTypeSchema.options) {
            expect(describeAuditEvent(event({ type })).length).toBeGreaterThan(
                0,
            );
        }
    });

    test("names the actor and the invited address", () => {
        expect(
            describeAuditEvent(
                event({
                    type: "MEMBER_INVITED",
                    context: {
                        targetEmail: "reader@example.com",
                        toRole: "VIEWER",
                    },
                }),
            ),
        ).toBe("Ada invited reader@example.com as viewer");
    });

    test("stays readable after the acting account is deleted", () => {
        const sentence = describeAuditEvent(
            event({ actorUserId: null, actorName: null, type: "MEMBER_REMOVED" }),
        );
        expect(sentence).toBe("A removed account removed a member");
    });

    test("describes a role change in both directions", () => {
        expect(
            describeAuditEvent(
                event({
                    type: "MEMBER_ROLE_CHANGED",
                    context: { fromRole: "VIEWER", toRole: "EDITOR" },
                }),
            ),
        ).toContain("from viewer to editor");
    });

    test("reads sensibly when the context is empty", () => {
        for (const type of auditEventTypeSchema.options) {
            const sentence = describeAuditEvent(event({ type, context: {} }));
            expect(sentence).not.toContain("undefined");
            expect(sentence).not.toContain("null");
        }
    });
});
