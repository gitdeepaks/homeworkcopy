import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { flattenError, ZodError } from "zod";
import { AppError } from "../types/app-error.js";
import { logger } from "../lib/logger.js";

function sendError(
    res: Response,
    statusCode: number,
    requestId: string,
    code: string,
    message: string,
    details?: unknown,
): void {
    res.status(statusCode).json({
        error: {
            code,
            message,
            requestId,
            ...(details === undefined ? {} : { details }),
        },
    });
}

export function errorHandler(
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    void next;
    if (error instanceof AppError) {
        sendError(res, error.statusCode, req.requestId, error.code, error.message, error.details);
        return;
    }

    if (error instanceof ZodError) {
        sendError(res, 400, req.requestId, "VALIDATION_FAILED", "Validation failed", flattenError(error).fieldErrors);
        return;
    }

    if (error instanceof multer.MulterError) {
        sendError(res, 400, req.requestId, "UPLOAD_INVALID", error.message);
        return;
    }

    if (error instanceof Error && error.message === "Only PDF files are allowed") {
        sendError(res, 400, req.requestId, "UPLOAD_INVALID", error.message);
        return;
    }

    const cloudinaryError = error instanceof Error ? error : null;
    if (
        cloudinaryError?.name === "UnexpectedResponse"
    ) {
        sendError(res, 502, req.requestId, "PROVIDER_REJECTED", "File storage rejected the upload.");
        return;
    }

    logger.error({ error, requestId: req.requestId }, "request failed");
    sendError(res, 500, req.requestId, "INTERNAL_ERROR", "Internal server error");
}
