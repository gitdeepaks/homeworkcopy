import { describe, expect, test } from "bun:test";
import { toPrismaJson } from "./prisma-json.js";

describe("toPrismaJson", () => {
    test("drops properties that were cleared", () => {
        expect(
            toPrismaJson({
                version: 1,
                failure: undefined,
                model: "gpt-4o-mini",
            }),
        ).toEqual({ version: 1, model: "gpt-4o-mini" });
    });

    test("keeps nested structures intact", () => {
        expect(
            toPrismaJson({ items: [{ label: "a" }, { label: "b" }] }),
        ).toEqual({ items: [{ label: "a" }, { label: "b" }] });
    });

    test("rejects values Postgres cannot store as JSON", () => {
        expect(() => toPrismaJson(undefined)).toThrow();
    });
});
