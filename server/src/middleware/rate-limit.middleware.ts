/**
 * Abuse controls.
 *
 * Limits are keyed by authenticated user where there is one and by client
 * address otherwise. The address part only works if Express is told how many
 * proxies sit in front of it — see `TRUST_PROXY_HOPS` — because behind a load
 * balancer every request otherwise appears to come from the balancer, and the
 * whole internet shares one bucket.
 *
 * Two shapes of limit live here. Per-minute limits protect the API from bursts.
 * The per-day ones on export and deletion protect something different: those
 * operations are expensive and irreversible, and the point is not to smooth
 * traffic but to make a runaway client visible before it has built forty
 * archives of somebody's account.
 */

import { ipKeyGenerator, rateLimit } from "express-rate-limit";

function createLimiter(windowMs: number, limit: number) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        keyGenerator: (req) =>
            req.session?.user.id ??
            ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown"),
        handler: (req, res) => {
            res.status(429).json({
                error: {
                    code: "RATE_LIMITED",
                    message: "Too many requests. Please try again later.",
                    requestId: req.requestId,
                },
            });
        },
    });
}

export const authSensitiveRateLimit = createLimiter(60_000, 120);
export const sourceImportRateLimit = createLimiter(60 * 60_000, 30);
export const chatRateLimit = createLimiter(60_000, 20);
export const generationRateLimit = createLimiter(60 * 60_000, 30);
export const memoryMutationRateLimit = createLimiter(60_000, 30);

/**
 * Building an archive reads an entire account. The service enforces a daily cap
 * of its own with a clearer message; this is the outer guard that stops a loop
 * from reaching that check thousands of times.
 */
export const dataExportRateLimit = createLimiter(60 * 60_000, 10);

/**
 * Account deletion is idempotent — a second request joins the first receipt —
 * so this exists to bound the cost of someone hammering it, not to protect the
 * account from a double-click.
 */
export const accountDeletionRateLimit = createLimiter(60 * 60_000, 5);

/**
 * A backstop across the whole API, keyed the same way as the specific limits.
 *
 * Deliberately loose. Its job is to stop one client from exhausting the process
 * — connection pool, event loop, provider budget — not to shape normal use, so
 * it sits well above anything a person browsing the product would generate.
 */
export const globalRateLimit = createLimiter(60_000, 600);
