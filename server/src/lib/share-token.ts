/**
 * Bearer tokens for notebook invitations and share links.
 *
 * A token is a capability: holding one is what lets someone act on it. So the
 * token is generated once, handed to the caller once, and stored only as a
 * SHA-256 hash. A database read — or a leaked backup — therefore yields nothing
 * that can be redeemed.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SHARE_TOKEN_BYTES } from "@homeworkcopy/contracts";

/**
 * Mints a fresh token.
 *
 * URL-safe base64 keeps the token intact through routers, query strings, and
 * copy-paste, so a link never has to be escaped to survive being shared.
 *
 * @returns A URL-safe token with {@link SHARE_TOKEN_BYTES} bytes of entropy
 */
export function generateShareToken(): string {
    return randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
}

/**
 * Hashes a token for storage and lookup.
 *
 * Plain SHA-256 rather than a password hash on purpose: the input is 256 bits of
 * uniform randomness, so there is no dictionary to slow an attacker down with,
 * and a fast hash keeps redemption a single indexed lookup.
 *
 * @param token - The token as it appears in a link
 * @returns Lowercase hex digest, used as the stored lookup key
 */
export function hashShareToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Compares two token hashes without leaking how far the match got.
 *
 * Lookups are by unique index, so this exists for the paths that compare a
 * recomputed hash against one already in hand.
 *
 * @param a - First hex digest
 * @param b - Second hex digest
 * @returns `true` when the digests are identical
 */
export function shareTokenHashesMatch(a: string, b: string): boolean {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");

    if (left.length !== right.length || left.length === 0) {
        return false;
    }

    return timingSafeEqual(left, right);
}

/**
 * Computes an expiry a whole number of days out.
 *
 * @param days - Lifetime in days
 * @param now - Instant the lifetime starts from
 * @returns The expiry instant
 */
export function expiryFromNow(days: number, now: Date): Date {
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);
}
