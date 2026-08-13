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
