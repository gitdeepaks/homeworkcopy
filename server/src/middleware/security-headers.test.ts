import { describe, expect, test } from "bun:test";
import type { NextFunction } from "express";
import {
    markPrivateResponse,
    securityHeaders,
} from "./security-headers.middleware.js";

/**
 * The smallest thing that behaves like the parts of `Response` these functions
 * touch. A real Express response would need a socket; the contract under test is
 * "which headers get set", and this records exactly that.
 */
function fakeResponse() {
    const headers = new Map<string, string>();
    const removed: string[] = [];

    const response = {
        setHeader(name: string, value: string) {
            headers.set(name, value);
        },
        removeHeader(name: string) {
            removed.push(name);
            headers.delete(name);
        },
    };

    return { response, headers, removed };
}

/**
 * Runs the middleware against a fake response.
 *
 * No stand-in for `Request` is needed: the middleware declares that it reads
 * nothing from one, and this is what that declaration buys.
 */
function applySecurityHeaders(): Map<string, string> {
    const { response, headers } = fakeResponse();
    let called = false;
    const next: NextFunction = () => {
        called = true;
    };

    securityHeaders({}, response, next);
    expect(called).toBe(true);
    return headers;
}

describe("API security headers", () => {
    const headers = applySecurityHeaders();

    test("content type sniffing is off", () => {
        expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    test("the API cannot be framed", () => {
        expect(headers.get("X-Frame-Options")).toBe("DENY");
        expect(headers.get("Content-Security-Policy")).toContain(
            "frame-ancestors 'none'",
        );
    });

    test("the policy loads nothing, because a JSON API needs nothing", () => {
        const policy = headers.get("Content-Security-Policy") ?? "";
        expect(policy).toContain("default-src 'none'");
        expect(policy).toContain("sandbox");
        expect(policy).toContain("form-action 'none'");
    });

    test("referrers are never sent onward", () => {
        expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    });

    test("device features are denied wholesale", () => {
        const policy = headers.get("Permissions-Policy") ?? "";
        for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
            expect(policy).toContain(`${feature}=()`);
        }
    });

    test("cross-origin isolation headers are set", () => {
        expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
        expect(headers.get("Cross-Origin-Resource-Policy")).toBe("same-site");
    });

    test("HSTS is absent outside production, so localhost is not pinned to https", () => {
        expect(process.env.NODE_ENV).not.toBe("production");
        expect(headers.has("Strict-Transport-Security")).toBe(false);
    });
});

describe("private responses", () => {
    test("are neither cached nor indexed", () => {
        const { response, headers } = fakeResponse();
        markPrivateResponse(response);

        expect(headers.get("Cache-Control")).toContain("no-store");
        expect(headers.get("Cache-Control")).toContain("private");
        expect(headers.get("X-Robots-Tag")).toContain("noindex");
        expect(headers.get("X-Robots-Tag")).toContain("noarchive");
    });
});
