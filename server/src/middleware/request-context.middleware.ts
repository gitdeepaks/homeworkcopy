import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

declare module "express-serve-static-core" {
    interface Request {
        requestId: string;
    }
}

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
        logger.info({
            requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: Math.round(performance.now() - startedAt),
        }, "request completed");
    });

    next();
}
