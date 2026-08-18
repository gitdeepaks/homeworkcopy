import { describe, expect, test } from "bun:test";
import { SHARE_TOKEN_BYTES, shareTokenSchema } from "@homeworkcopy/contracts";
import {
    expiryFromNow,
    generateShareToken,
    hashShareToken,
    shareTokenHashesMatch,
} from "./share-token.js";

describe("generateShareToken", () => {
    test("produces a token the URL contract accepts", () => {
        expect(shareTokenSchema.safeParse(generateShareToken()).success).toBe(
            true,
        );
    });

    test("carries the full entropy budget", () => {
        expect(Buffer.from(generateShareToken(), "base64url")).toHaveLength(
            SHARE_TOKEN_BYTES,
        );
    });

    test("never repeats", () => {
        const tokens = new Set(
            Array.from({ length: 500 }, () => generateShareToken()),
        );
        expect(tokens.size).toBe(500);
    });
});

describe("hashShareToken", () => {
    test("is stable for the same token", () => {
        const token = generateShareToken();
        expect(hashShareToken(token)).toBe(hashShareToken(token));
    });

    test("differs for different tokens", () => {
        expect(hashShareToken(generateShareToken())).not.toBe(
            hashShareToken(generateShareToken()),
        );
    });

    test("is not the token itself, so a stored row cannot be redeemed", () => {
        const token = generateShareToken();
        const hash = hashShareToken(token);
        expect(hash).not.toBe(token);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("shareTokenHashesMatch", () => {
    test("matches identical digests", () => {
        const hash = hashShareToken("abc");
        expect(shareTokenHashesMatch(hash, hash)).toBe(true);
    });

    test("rejects different digests", () => {
        expect(
            shareTokenHashesMatch(hashShareToken("abc"), hashShareToken("abd")),
        ).toBe(false);
    });

    test("rejects empty or malformed digests instead of matching them", () => {
        expect(shareTokenHashesMatch("", "")).toBe(false);
        expect(shareTokenHashesMatch("zz", hashShareToken("abc"))).toBe(false);
    });
});

describe("expiryFromNow", () => {
    test("adds whole days", () => {
        const now = new Date("2026-08-18T12:00:00.000Z");
        expect(expiryFromNow(14, now).toISOString()).toBe(
            "2026-09-01T12:00:00.000Z",
        );
    });

    test("always lands in the future", () => {
        const now = new Date("2026-08-18T12:00:00.000Z");
        expect(expiryFromNow(1, now).getTime()).toBeGreaterThan(now.getTime());
    });
});
