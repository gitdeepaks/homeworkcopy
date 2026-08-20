/**
 * Response headers that hold whether or not a route remembers to ask.
 *
 * This is a JSON API, so the interesting instruction is the negative one:
 * nothing here should ever be rendered as a document, framed, or treated as a
 * script. `default-src 'none'` plus `sandbox` says that in the one language a
 * browser will act on even if a response is served with a wrong content type —
 * which is the case these headers exist for, since a correctly served response
 * was never the risk.
 *
 * The client's own CSP is a separate, much longer policy, and it lives in
 * `client/next.config.ts` next to the app whose scripts it has to allow.
 */

import type { NextFunction } from "express";
import { isProduction } from "../config/env.js";

/**
 * The only part of a response these functions touch.
 *
 * Declaring what is actually used, rather than the whole `Response`, is what
 * lets the headers be tested without standing up a socket — and it says
 * truthfully that nothing here reads or writes a body.
 */
export type ResponseHeaders = {
    setHeader(name: string, value: string): void;
    removeHeader(name: string): void;
};

/**
 * A request parameter that is never read.
 *
 * It exists because Express decides what a handler *is* from its arity: three
 * parameters is ordinary middleware, four is an error handler. Dropping the
 * unused first parameter would silently turn this into something Express calls
 * with the wrong arguments.
 */
type UnreadRequest = object;

/** Two years, the minimum for HSTS preload eligibility. */
const HSTS_MAX_AGE_SECONDS = 63_072_000;

/**
 * Browser features this API never uses.
 *
 * Sent because a response is reachable directly in a browser tab, and an empty
 * allowlist is the difference between "we do not use the camera" and "nothing
 * served from this origin may".
 */
const PERMISSIONS_POLICY = [
    "accelerometer=()",
    "autoplay=()",
    "camera=()",
    "display-capture=()",
    "encrypted-media=()",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "midi=()",
    "payment=()",
    "usb=()",
].join(", ");

const API_CONTENT_SECURITY_POLICY = [
    "default-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "sandbox",
].join("; ");

/**
 * Applies the standing security headers to every API response.
 *
 * HSTS is sent only in production: issuing it from a development server pins
 * `localhost` to https in the developer's browser for two years, which is a
 * memorable afternoon.
 *
 * @param req - Incoming request
 * @param res - Response the headers are set on
 * @param next - Next middleware
 */
export function securityHeaders(
    _req: UnreadRequest,
    res: ResponseHeaders,
    next: NextFunction,
): void {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    // `same-site` rather than `cross-origin`: the browser reaches the API
    // through the client's rewrites, so these are same-site requests. If the API
    // is ever served from a different registrable domain than the client, this
    // has to widen — CORP governs `no-cors` subresource loads, which is what a
    // signed media URL embedded in a page would be.
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
    res.setHeader("Content-Security-Policy", API_CONTENT_SECURITY_POLICY);
    res.setHeader("Origin-Agent-Cluster", "?1");

    // Express advertises itself by default, which tells a scanner which CVE list
    // to start with for no benefit to anyone.
    res.removeHeader("X-Powered-By");

    if (isProduction()) {
        res.setHeader(
            "Strict-Transport-Security",
            `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`,
        );
    }

    next();
}

/**
 * Marks a response as neither cacheable nor indexable.
 *
 * Applied to anything carrying a bearer capability or a signed URL: an
 * invitation token in a shared cache, or an export link in a search index, is
 * the capability handed to whoever finds it.
 *
 * @param res - Response to mark
 */
export function markPrivateResponse(res: ResponseHeaders): void {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
}

/**
 * Middleware form of {@link markPrivateResponse}.
 *
 * @param req - Incoming request
 * @param res - Response to mark
 * @param next - Next middleware
 */
export function noStore(
    _req: UnreadRequest,
    res: ResponseHeaders,
    next: NextFunction,
): void {
    markPrivateResponse(res);
    next();
}
