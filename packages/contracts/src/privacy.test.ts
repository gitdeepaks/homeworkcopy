import { describe, expect, test } from "bun:test";
import {
    activeDataProcessors,
    aggregateHealthStatus,
    DATA_CATEGORY_LABELS,
    DATA_PROCESSOR_IDS,
    DATA_PROCESSORS,
    DEFAULT_PRIVACY_PREFERENCES,
    DELETE_ACCOUNT_CONFIRMATION,
    DELETION_TARGET_LABELS,
    DELETION_TARGETS,
    deleteAccountRequestSchema,
    deletionStatusFromOutcomes,
    EXPORT_EXCLUSIONS,
    isRequiredHealthComponent,
    RETAINED_RESOURCES,
    RETENTION_POLICY,
    retentionCutoff,
    updatePrivacyPreferencesSchema,
    type DeletionOutcome,
    type HealthCheck,
} from "./index";

describe("data processing disclosure", () => {
    test("every processor id has an entry keyed by itself", () => {
        for (const id of DATA_PROCESSOR_IDS) {
            expect(DATA_PROCESSORS[id].id).toBe(id);
        }
    });

    test("every processor names a purpose, a policy, and a data category", () => {
        for (const id of DATA_PROCESSOR_IDS) {
            const processor = DATA_PROCESSORS[id];
            expect(processor.purpose.length).toBeGreaterThan(0);
            expect(processor.policyUrl.startsWith("https://")).toBe(true);
            expect(processor.categories.length).toBeGreaterThan(0);
        }
    });

    test("every data category has reader-facing copy", () => {
        for (const id of DATA_PROCESSOR_IDS) {
            for (const category of DATA_PROCESSORS[id].categories) {
                expect(DATA_CATEGORY_LABELS[category].length).toBeGreaterThan(0);
            }
        }
    });

    test("only optional processors can be switched off", () => {
        for (const id of DATA_PROCESSOR_IDS) {
            const processor = DATA_PROCESSORS[id];
            if (processor.controlledBy !== null) {
                expect(processor.necessity).toBe("optional");
            }
        }
    });

    test("a processor that retains what a reader typed is either required or controllable", () => {
        for (const id of DATA_PROCESSOR_IDS) {
            const processor = DATA_PROCESSORS[id];
            const holdsReaderContent = processor.categories.some(
                (category) =>
                    category === "chatContent" || category === "sourceContent",
            );
            if (
                processor.retainsContent &&
                holdsReaderContent &&
                processor.necessity === "optional"
            ) {
                expect(processor.controlledBy).not.toBeNull();
            }
        }
    });
});

describe("consent controls", () => {
    test("optional processing starts off", () => {
        expect(DEFAULT_PRIVACY_PREFERENCES).toEqual({
            learnedMemory: false,
            webSearch: false,
        });
    });

    test("defaults exclude every controllable processor", () => {
        const active = activeDataProcessors(DEFAULT_PRIVACY_PREFERENCES);
        for (const processor of active) {
            expect(processor.controlledBy).toBeNull();
        }
    });

    test("granting a preference admits exactly the processors it controls", () => {
        const active = activeDataProcessors({
            learnedMemory: true,
            webSearch: false,
        });
        const ids = active.map((processor) => processor.id);
        expect(ids).toContain("mem0");
        expect(ids).not.toContain("tavily");
    });

    test("every required processor is active regardless of preferences", () => {
        const active = activeDataProcessors(DEFAULT_PRIVACY_PREFERENCES);
        const required = DATA_PROCESSOR_IDS.filter(
            (id) => DATA_PROCESSORS[id].necessity === "required",
        );
        for (const id of required) {
            expect(active.some((processor) => processor.id === id)).toBe(true);
        }
    });

    test("an empty preference change is rejected", () => {
        expect(updatePrivacyPreferencesSchema.safeParse({}).success).toBe(false);
    });

    test("a partial preference change is accepted", () => {
        const parsed = updatePrivacyPreferencesSchema.safeParse({
            webSearch: true,
        });
        expect(parsed.success).toBe(true);
        expect(parsed.success && parsed.data.learnedMemory).toBeUndefined();
    });
});

describe("retention policy", () => {
    test("every retained resource has a rule keyed by itself", () => {
        for (const resource of RETAINED_RESOURCES) {
            expect(RETENTION_POLICY[resource].resource).toBe(resource);
            expect(RETENTION_POLICY[resource].summary.length).toBeGreaterThan(0);
        }
    });

    test("a cutoff is the retention window before now", () => {
        const now = new Date("2026-08-20T00:00:00.000Z");
        const cutoff = retentionCutoff("chatUsage", now);
        expect(cutoff?.toISOString()).toBe("2026-05-22T00:00:00.000Z");
    });

    test("an indefinitely retained resource has no cutoff", () => {
        expect(retentionCutoff("deletionReceipt", new Date())).toBeNull();
    });

    test("the deletion receipt is the only thing kept forever", () => {
        const indefinite = RETAINED_RESOURCES.filter(
            (resource) => RETENTION_POLICY[resource].retainedDays === null,
        );
        expect(indefinite).toEqual(["deletionReceipt"]);
    });

    test("an export ages out before the audit trail does", () => {
        expect(RETENTION_POLICY.dataExport.retainedDays).toBeLessThan(
            RETENTION_POLICY.auditEvent.retainedDays ?? Number.POSITIVE_INFINITY,
        );
    });
});

describe("account deletion", () => {
    test("the confirmation phrase must match exactly", () => {
        expect(
            deleteAccountRequestSchema.safeParse({
                confirmation: DELETE_ACCOUNT_CONFIRMATION,
            }).success,
        ).toBe(true);
        expect(
            deleteAccountRequestSchema.safeParse({
                confirmation: DELETE_ACCOUNT_CONFIRMATION.toLowerCase(),
            }).success,
        ).toBe(false);
        expect(deleteAccountRequestSchema.safeParse({}).success).toBe(false);
    });

    test("every deletion target has reader-facing copy", () => {
        for (const target of DELETION_TARGETS) {
            expect(DELETION_TARGET_LABELS[target].length).toBeGreaterThan(0);
        }
    });

    test("a deletion is complete only when every target reported and none failed", () => {
        const allDeleted: DeletionOutcome[] = DELETION_TARGETS.map((target) => ({
            target,
            status: "DELETED",
            removedCount: 1,
        }));
        expect(deletionStatusFromOutcomes(allDeleted)).toBe("COMPLETED");
    });

    test("a skipped target still counts as reported", () => {
        const outcomes: DeletionOutcome[] = DELETION_TARGETS.map((target) => ({
            target,
            status: target === "learnedMemory" ? "SKIPPED" : "DELETED",
            removedCount: null,
        }));
        expect(deletionStatusFromOutcomes(outcomes)).toBe("COMPLETED");
    });

    test("one failure leaves the deletion incomplete", () => {
        const outcomes: DeletionOutcome[] = DELETION_TARGETS.map((target) => ({
            target,
            status: target === "objectStorage" ? "FAILED" : "DELETED",
            removedCount: null,
        }));
        expect(deletionStatusFromOutcomes(outcomes)).toBe("INCOMPLETE");
    });

    test("a target that never reported leaves the deletion incomplete", () => {
        const outcomes: DeletionOutcome[] = [
            { target: "database", status: "DELETED", removedCount: 1 },
        ];
        expect(deletionStatusFromOutcomes(outcomes)).toBe("INCOMPLETE");
    });

    test("learned memories are excluded from exports because deletion owns them", () => {
        expect(
            EXPORT_EXCLUSIONS.some((line) => line.includes("Learned memories")),
        ).toBe(true);
    });
});

describe("health aggregation", () => {
    function check(overrides: Partial<HealthCheck>): HealthCheck {
        return {
            component: "database",
            required: true,
            status: "OK",
            latencyMs: 1,
            detail: null,
            ...overrides,
        };
    }

    test("the database is required and web search is not", () => {
        expect(isRequiredHealthComponent("database")).toBe(true);
        expect(isRequiredHealthComponent("webSearch")).toBe(false);
    });

    test("all healthy is OK", () => {
        expect(
            aggregateHealthStatus([
                check({}),
                check({ component: "webSearch", required: false }),
            ]),
        ).toBe("OK");
    });

    test("an unconfigured optional component is not a fault", () => {
        expect(
            aggregateHealthStatus([
                check({}),
                check({
                    component: "webSearch",
                    required: false,
                    status: "NOT_CONFIGURED",
                    latencyMs: null,
                }),
            ]),
        ).toBe("OK");
    });

    test("an optional component being down only degrades", () => {
        expect(
            aggregateHealthStatus([
                check({}),
                check({
                    component: "webSearch",
                    required: false,
                    status: "DOWN",
                }),
            ]),
        ).toBe("DEGRADED");
    });

    test("a required component being down takes the API down", () => {
        expect(aggregateHealthStatus([check({ status: "DOWN" })])).toBe("DOWN");
    });

    test("a slow required component degrades rather than fails", () => {
        expect(aggregateHealthStatus([check({ status: "DEGRADED" })])).toBe(
            "DEGRADED",
        );
    });
});
