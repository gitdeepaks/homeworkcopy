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
import { clerkWebhookRoutes } from "./routes/clerk-webhook.routes.js";
import { NotFoundError } from "./types/app-error.js";
import { logger } from "./lib/logger.js";

export const app = express();
const port = process.env.PORT ?? 8080;
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:3000";

app.use(requestContext);
app.use(
    cors({
        origin: clientUrl,
        credentials: true,
    }),
);

app.use("/api/webhooks/clerk", clerkWebhookRoutes);
app.use(express.json({ limit: "1mb" }));
app.use(
    clerkMiddleware({
        authorizedParties: [clientUrl],
    }),
);
const inngestHandler = serve({ client: inngest, functions });
app.use("/api/inngest", inngestHandler);
app.get("/", (_req, res) => {
    res.json({ message: "Hello from Homeworkcopy API" });
});

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

registerRoutes(app);

app.use((_req, _res, next) => {
    next(new NotFoundError("Route not found"));
});

app.use(errorHandler);

const server = app.listen(port, () => {
    logger.info({ port }, "server started");
});

function shutdown(signal: string) {
    logger.info({ signal }, "server shutting down");
    server.close((error) => {
        if (error) {
            logger.error({ error }, "server shutdown failed");
            process.exitCode = 1;
        }
    });
}

process.once("SIGTERM", () => { shutdown("SIGTERM"); });
process.once("SIGINT", () => { shutdown("SIGINT"); });
