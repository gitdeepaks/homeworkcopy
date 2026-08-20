import "dotenv/config";
import { clerkMiddleware } from "@clerk/express";
import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/error-handler.middleware.js";
import { registerRoutes } from "./routes/index.js";
import { serve } from "inngest/express";
import { inngest } from "./inngest/client.js";
import { functions } from "./inngest/index.js";
import { requestContext } from "./middleware/request-context.middleware.js";
import { securityHeaders } from "./middleware/security-headers.middleware.js";
import { globalRateLimit } from "./middleware/rate-limit.middleware.js";
import { clerkWebhookRoutes } from "./routes/clerk-webhook.routes.js";
import { opsRoutes } from "./routes/ops.routes.js";
import { NotFoundError } from "./types/app-error.js";
import { logger } from "./lib/logger.js";
import { allowedOrigins, env, EnvironmentError } from "./config/env.js";

/**
 * Validates the environment before anything is wired up.
 *
 * A production container with a missing secret should fail to start — visibly,
 * in the deploy — rather than come up, pass its health check, and return 500s to
 * whoever clicks first.
 */
function loadEnvironment() {
    try {
        return env();
    } catch (error) {
        if (error instanceof EnvironmentError) {
            logger.fatal({ problems: error.problems }, "invalid environment");
            process.exit(1);
        }
        throw error;
    }
}

const config = loadEnvironment();
const origins: string[] = [...allowedOrigins()];

export const app = express();
const port = config.PORT;

/**
 * How many proxies to trust for the client address.
 *
 * A number, never `true`. `trust proxy: true` tells Express to believe the
 * left-most `X-Forwarded-For` entry, which the client controls, so every
 * address-keyed rate limit becomes bypassable by adding a header.
 */
app.set("trust proxy", config.TRUST_PROXY_HOPS);
app.disable("x-powered-by");

app.use(requestContext);
app.use(securityHeaders);
app.use(
    cors({
        origin: (origin, callback) => {
            // A request with no Origin is not a browser cross-origin request —
            // it is curl, a health probe, or a server-side caller. CORS has
            // nothing to say about those, and refusing them here would break
            // the probes without protecting anything.
            if (origin === undefined || origins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error("Origin not allowed"));
        },
        credentials: true,
        maxAge: 600,
    }),
);

// Probes and scrapes come before authentication and before the rate limiter: a
// readiness check must still answer while the API is shedding load, or the
// platform will conclude the instance is dead and make the outage worse.
app.use(opsRoutes);

app.use("/api/webhooks/clerk", clerkWebhookRoutes);
app.use(express.json({ limit: "1mb" }));
app.use(
    clerkMiddleware({
        authorizedParties: origins,
    }),
);
const inngestHandler = serve({ client: inngest, functions });
app.use("/api/inngest", inngestHandler);

app.get("/", (_req, res) => {
    res.json({ message: "Hello from Homeworkcopy API" });
});

/** Kept as an alias for existing platform probes configured against it. */
app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

app.use("/api", globalRateLimit);

registerRoutes(app);

app.use((_req, _res, next) => {
    next(new NotFoundError("Route not found"));
});

app.use(errorHandler);

const server = app.listen(port, () => {
    logger.info(
        { port, environment: config.NODE_ENV, origins },
        "server started",
    );
});

/**
 * Stops accepting connections and lets in-flight requests finish.
 *
 * The deadline matters: a platform sends SIGTERM and then SIGKILL a fixed time
 * later, so a shutdown that waits indefinitely on one slow streaming response
 * gets killed mid-write anyway, without having closed anything cleanly.
 */
const SHUTDOWN_GRACE_MS = 15_000;

function shutdown(signal: string) {
    logger.info({ signal }, "server shutting down");

    const deadline = setTimeout(() => {
        logger.warn(
            { signal, graceMs: SHUTDOWN_GRACE_MS },
            "server shutdown deadline reached, exiting",
        );
        process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    deadline.unref();

    server.close((error) => {
        if (error) {
            logger.error({ error }, "server shutdown failed");
            process.exitCode = 1;
        }
        clearTimeout(deadline);
    });
}

process.once("SIGTERM", () => {
    shutdown("SIGTERM");
});
process.once("SIGINT", () => {
    shutdown("SIGINT");
});

/**
 * A rejection nobody handled means some path lost its error handling, which is
 * exactly the kind of thing that goes unnoticed until it corrupts state. Logged
 * loudly rather than left to Node's default, which in newer versions is to
 * terminate the process without saying much about why.
 */
process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "unhandled promise rejection");
});

process.on("uncaughtException", (error) => {
    logger.fatal({ error }, "uncaught exception");
    process.exitCode = 1;
    shutdown("uncaughtException");
});
