import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import {
    httpRequestDuration,
    httpRequests,
    statusClass,
} from "../lib/metrics.js";

declare module "express-serve-static-core" {
    interface Request {
        requestId: string;
    }
}

/**
 * The route template a request matched, e.g. `/api/workspaces/:id/sources`.
 *
 * Metrics are labelled with the template rather than the path. Labelling with
 * the path would mint one time series per notebook id, which is how a metrics
 * backend falls over. `req.route` is only populated once a handler has matched,
 * so an unmatched request is bucketed as `unmatched` rather than leaking the
 * arbitrary string somebody requested into a label.
 *
 * @param req - The completed request
 * @returns A bounded route label
 */
function routeLabel(req: Request): string {
    const base = typeof req.baseUrl === "string" ? req.baseUrl : "";
    const path = req.route === undefined ? null : req.path;
    if (path === null) return "unmatched";

    // `baseUrl` carries the concrete values of any parameters consumed by a
    // parent router, so it is normalized back to the template shape.
    const normalizedBase = base.replace(/\/[^/]{16,}/g, "/:id");
    return `${normalizedBase}${path}` || "/";
}

/**
 * Attaches a request id, logs the outcome, and records it as a metric.
 *
 * The id is taken from an inbound `X-Request-Id` when there is one, so a trace
 * started at the edge stays one trace rather than becoming two, and is echoed
 * back so a reader reporting a problem can quote it.
 *
 * @param req - Incoming request
 * @param res - Response the id is echoed on
 * @param next - Next middleware
 */
export function requestContext(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const requestId = req.header("x-request-id")?.trim() || crypto.randomUUID();
    const startedAt = performance.now();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);

    res.on("finish", () => {
        const durationMs = performance.now() - startedAt;
        const route = routeLabel(req);

        httpRequests.inc({
            route,
            method: req.method,
            status: statusClass(res.statusCode),
        });
        httpRequestDuration.observe(
            { route, method: req.method },
            durationMs / 1000,
        );

        logger.info(
            {
                requestId,
                method: req.method,
                path: req.path,
                route,
                statusCode: res.statusCode,
                durationMs: Math.round(durationMs),
            },
            "request completed",
        );
    });

    next();
}
