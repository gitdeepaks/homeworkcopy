/**
 * Probes and scrapes.
 *
 * Three of these are unauthenticated because the thing calling them is a load
 * balancer that cannot hold a credential. They are kept deliberately thin: a
 * status word and, at most, a component name. The two that describe internal
 * topology — the detailed report and the metrics scrape — require the ops token
 * and do not exist when one is not configured, because an endpoint that 401s is
 * still an endpoint that confirms what is running here.
 */

import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { buildHealthReport, checkReadiness, uptimeSeconds } from "../lib/health.js";
import { renderMetrics } from "../lib/metrics.js";
import { markPrivateResponse } from "../middleware/security-headers.middleware.js";
import { NotFoundError } from "../types/app-error.js";
import { asyncHandler } from "../utils/async-handler.js";

export const opsRoutes = Router();

/**
 * Compares a presented token to the configured one without leaking its length
 * or contents through timing.
 *
 * @param presented - Token from the request
 * @param expected - Token from the environment
 * @returns Whether they match
 */
function tokenMatches(presented: string, expected: string): boolean {
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

/**
 * Gates a route behind the ops token.
 *
 * Failure is `404`, not `401`: these routes are not part of the product's API
 * surface, and confirming they exist tells a scanner what to come back for.
 *
 * @param req - Incoming request
 * @param res - Response
 * @param next - Next middleware
 */
function requireOpsToken(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    void res;
    const expected = env().OPS_TOKEN;
    const presented = req.header("x-ops-token")?.trim();

    if (
        expected === undefined ||
        presented === undefined ||
        !tokenMatches(presented, expected)
    ) {
        next(new NotFoundError("Route not found"));
        return;
    }

    next();
}

/**
 * Liveness. Answers "should this process be restarted?" and therefore touches
 * nothing that could be someone else's outage.
 */
opsRoutes.get("/health/live", (_req: Request, res: Response) => {
    markPrivateResponse(res);
    res.json({ status: "ok", uptimeSeconds: uptimeSeconds() });
});

/**
 * Readiness. Answers "should this instance receive traffic?" — the database,
 * and nothing else.
 */
opsRoutes.get(
    "/health/ready",
    asyncHandler(async (_req: Request, res: Response) => {
        markPrivateResponse(res);
        const readiness = await checkReadiness();
        res.status(readiness.ready ? 200 : 503).json({
            status: readiness.ready ? "ready" : "unavailable",
            unavailable: readiness.unavailable,
        });
    }),
);

/**
 * The full report, for a human or a dashboard. Behind the ops token because it
 * enumerates which providers this deployment is wired to.
 */
opsRoutes.get(
    "/health/detail",
    requireOpsToken,
    asyncHandler(async (_req: Request, res: Response) => {
        markPrivateResponse(res);
        const report = await buildHealthReport();
        res.status(report.status === "DOWN" ? 503 : 200).json(report);
    }),
);

/** Prometheus scrape. */
opsRoutes.get(
    "/metrics",
    requireOpsToken,
    (_req: Request, res: Response) => {
        markPrivateResponse(res);
        res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
        res.send(renderMetrics());
    },
);
