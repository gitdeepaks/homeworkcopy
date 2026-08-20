import { describe, expect, test } from "bun:test";
import {
    DELETION_TARGETS,
    deletionStatusFromOutcomes,
    type DeletionOutcome,
} from "@homeworkcopy/contracts";
import { deletionSubjectHash } from "./account-deletion.service.js";

describe("deletion subject hash", () => {
    test("is a hex SHA-256, so a receipt table holds no identifiers", () => {
        const hash = deletionSubjectHash("user_abc123");
        expect(hash).toMatch(/^[a-f0-9]{64}$/);
        expect(hash).not.toContain("user_abc123");
    });

    test("is stable, so a retry continues the same receipt", () => {
        expect(deletionSubjectHash("user_abc123")).toBe(
            deletionSubjectHash("user_abc123"),
        );
    });

    test("distinguishes accounts", () => {
        expect(deletionSubjectHash("user_a")).not.toBe(
            deletionSubjectHash("user_b"),
        );
    });
});

describe("deletion completeness", () => {
    /**
     * Builds a walk result with one target overridden, which is the shape every
     * partial-failure case takes.
     */
    function walk(
        override: Partial<Record<(typeof DELETION_TARGETS)[number], DeletionOutcome["status"]>>,
    ): DeletionOutcome[] {
        return DELETION_TARGETS.map((target) => ({
            target,
            status: override[target] ?? "DELETED",
            removedCount: null,
        }));
    }

    test("a clean walk completes", () => {
        expect(deletionStatusFromOutcomes(walk({}))).toBe("COMPLETED");
    });

    test("a failure in any single store leaves it incomplete", () => {
        for (const target of DELETION_TARGETS) {
            expect(
                deletionStatusFromOutcomes(walk({ [target]: "FAILED" })),
            ).toBe("INCOMPLETE");
        }
    });

    test("an unconfigured provider is skipped, not failed", () => {
        expect(
            deletionStatusFromOutcomes(walk({ learnedMemory: "SKIPPED" })),
        ).toBe("COMPLETED");
    });

    test("the database is one of the targets that must report", () => {
        // The ordering guarantee — external stores first, database last — is
        // only meaningful if the database is part of the completeness check.
        expect(DELETION_TARGETS).toContain("database");
        expect(
            deletionStatusFromOutcomes(
                walk({}).filter((outcome) => outcome.target !== "database"),
            ),
        ).toBe("INCOMPLETE");
    });

    test("every external store is covered", () => {
        // Adding a provider that stores user content means adding it here, and
        // this asserts the list has not silently shrunk.
        for (const target of [
            "vectorIndex",
            "objectStorage",
            "learnedMemory",
            "identityProvider",
        ] as const) {
            expect(DELETION_TARGETS).toContain(target);
        }
    });
});
