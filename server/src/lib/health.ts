/**
 * What "healthy" means, component by component.
 *
 * The distinction this file exists to make: **liveness** is whether the process
 * should be restarted, **readiness** is whether it should receive traffic, and
 * **health** is a description for a human. Collapsing them is how a Tavily
 * outage becomes a rolling restart of every API instance — the platform sees a
 * failing probe and does the only thing it knows how to do.
 *
 * So: liveness never touches a dependency. Readiness touches only the ones the
 * API genuinely cannot serve without, which is the database. Everything else is
 * reported, never enforced.
 */

import {
    aggregateHealthStatus,
    isRequiredHealthComponent,
    type HealthCheck,
    type HealthComponent,
    type HealthReport,
} from "@homeworkcopy/contracts";
import prisma from "./db.js";

/** A required check slower than this is reported as degraded rather than fine. */
const SLOW_REQUIRED_CHECK_MS = 1_000;

/** A check that hangs must not hang the probe that called it. */
const CHECK_TIMEOUT_MS = 2_000;

const startedAt = Date.now();

/**
 * Runs a check with a deadline.
 *
 * A health probe that waits on a wedged connection pool reports nothing and
 * eventually times out at the platform's deadline instead of ours, which loses
 * the detail of *which* component was wedged.
 *
 * @param component - Component being checked
 * @param probe - The check itself
 * @returns The check result, never a rejection
 */
async function timedCheck(
    component: HealthComponent,
    probe: () => Promise<void>,
): Promise<HealthCheck> {
    const required = isRequiredHealthComponent(component);
    const startedCheckAt = performance.now();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => {
            resolve("timeout");
        }, CHECK_TIMEOUT_MS);
    });

    try {
        const outcome = await Promise.race([
            probe().then(() => "ok" as const),
            timeout,
        ]);
        const latencyMs = Math.round(performance.now() - startedCheckAt);

        if (outcome === "timeout") {
            return {
                component,
                required,
                status: "DOWN",
                latencyMs,
                detail: "Did not respond within the health check deadline.",
            };
        }

        return {
            component,
            required,
            status:
                required && latencyMs > SLOW_REQUIRED_CHECK_MS ? "DEGRADED" : "OK",
            latencyMs,
            detail:
                required && latencyMs > SLOW_REQUIRED_CHECK_MS
                    ? "Responding, but slowly."
                    : null,
        };
    } catch {
        // The provider's own message is deliberately dropped. A health endpoint
        // is one of the least authenticated surfaces a deployment has, and a
        // driver error string routinely contains a host, a port, and a username.
        return {
            component,
            required,
            status: "DOWN",
            latencyMs: Math.round(performance.now() - startedCheckAt),
            detail: "Unreachable.",
        };
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

/**
 * Reports a component that needs no probe because it was never configured.
 *
 * @param component - Component in question
 * @returns A `NOT_CONFIGURED` check
 */
function notConfigured(component: HealthComponent): HealthCheck {
    return {
        component,
        required: isRequiredHealthComponent(component),
        status: "NOT_CONFIGURED",
        latencyMs: null,
        detail: "Not configured for this deployment.",
    };
}

/**
 * Reports a configured component without calling it.
 *
 * Used for providers whose only "are you there?" call costs money or rate-limit
 * budget on every scrape. Reporting configuration is honest about what it knows;
 * calling a paid endpoint every fifteen seconds to find out is not a trade worth
 * making, and the real signal for those providers is
 * `homeworkcopy_provider_calls_total`, which is measured from actual traffic.
 */
function configuredButUnprobed(component: HealthComponent): HealthCheck {
    return {
        component,
        required: isRequiredHealthComponent(component),
        status: "OK",
        latencyMs: null,
        detail: "Configured. Live status is reported from real traffic metrics.",
    };
}

/**
 * Checks the database.
 *
 * The only check readiness depends on, and the only one that runs a query.
 *
 * @returns The database check
 */
export function checkDatabase(): Promise<HealthCheck> {
    return timedCheck("database", async () => {
        await prisma.$queryRaw`SELECT 1`;
    });
}

/** Whether a value names a configured provider. */
function configured(value: string | undefined): boolean {
    return value !== undefined && value.trim() !== "";
}

/**
 * Reports every component this deployment has.
 *
 * @returns The full report, including the aggregate status
 */
export async function buildHealthReport(): Promise<HealthReport> {
    const database = await checkDatabase();

    const checks: HealthCheck[] = [
        database,
        configured(process.env.PINECONE_API_KEY)
            ? configuredButUnprobed("vectorIndex")
            : notConfigured("vectorIndex"),
        configured(process.env.CLOUDINARY_CLOUD_NAME)
            ? configuredButUnprobed("objectStorage")
            : notConfigured("objectStorage"),
        configured(process.env.OPENAI_API_KEY)
            ? configuredButUnprobed("modelProvider")
            : notConfigured("modelProvider"),
        configured(process.env.INNGEST_EVENT_KEY) ||
        process.env.INNGEST_DEV === "1"
            ? configuredButUnprobed("jobQueue")
            : notConfigured("jobQueue"),
        configured(process.env.TAVILY_API_KEY)
            ? configuredButUnprobed("webSearch")
            : notConfigured("webSearch"),
        configured(process.env.MEM0_API_KEY)
            ? configuredButUnprobed("learnedMemory")
            : notConfigured("learnedMemory"),
        configured(process.env.FIRECRAWL_API_KEY)
            ? configuredButUnprobed("webScraper")
            : notConfigured("webScraper"),
        configured(process.env.OPENAI_API_KEY)
            ? configuredButUnprobed("speech")
            : notConfigured("speech"),
    ];

    return {
        status: aggregateHealthStatus(checks),
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        checks,
    };
}

/** Whether this instance should be sent traffic. */
export type Readiness = {
    ready: boolean;
    /** Names only — no detail, because this endpoint is unauthenticated. */
    unavailable: readonly HealthComponent[];
};

/**
 * Checks only what the API cannot serve without.
 *
 * @returns Whether the instance is ready, and which required components are not
 */
export async function checkReadiness(): Promise<Readiness> {
    const database = await checkDatabase();
    const unavailable = [database]
        .filter((check) => check.required && check.status === "DOWN")
        .map((check) => check.component);

    return { ready: unavailable.length === 0, unavailable };
}

/** Seconds since this process started. */
export function uptimeSeconds(): number {
    return Math.floor((Date.now() - startedAt) / 1000);
}
