/**
 * The process environment, parsed once and typed.
 *
 * Two things matter here. The first is that a production deployment fails at
 * boot rather than at the first request: a missing `DATABASE_URL` should stop
 * the container from reporting ready, not surface as a 500 to whoever happened
 * to click first. The second is that every optional provider is a
 * `string | undefined` the compiler enforces, so "is this configured?" is a
 * question with one answer rather than a `process.env` read repeated in nine
 * files with nine slightly different notions of empty.
 *
 * Existing modules still read `process.env` for their own defaults. This module
 * does not replace them; it validates the whole environment at startup so a
 * misconfiguration is caught in one place, before anything tries to use it.
 */

import { z } from "zod";

/** Treats `""` as absent, so a blank value in a `.env` file is not "configured". */
const optionalString = z
    .string()
    .trim()
    .min(1)
    .optional()
    .catch(undefined);

const requiredString = z.string().trim().min(1);

const port = z.coerce.number().int().positive().max(65_535);

const booleanFlag = z
    .enum(["0", "1", "true", "false"])
    .transform((value) => value === "1" || value === "true");

const positiveInteger = z.coerce.number().int().positive();

/**
 * `production` turns on the strict checks: HSTS, required secrets, and a
 * refusal to start with a wildcard CORS origin.
 */
const nodeEnvSchema = z
    .enum(["development", "test", "production"])
    .default("development");

const envSchema = z.object({
    NODE_ENV: nodeEnvSchema,
    PORT: port.default(8080),
    DATABASE_URL: requiredString,

    /**
     * Comma-separated browser origins allowed to call the API. Every entry is
     * matched exactly — no wildcards, no suffix matching — because a suffix
     * match on `example.com` also matches `evil-example.com`.
     */
    CLIENT_URL: requiredString.default("http://localhost:3000"),

    CLERK_PUBLISHABLE_KEY: optionalString,
    CLERK_SECRET_KEY: optionalString,
    CLERK_WEBHOOK_SIGNING_SECRET: optionalString,

    OPENAI_API_KEY: optionalString,
    PINECONE_API_KEY: optionalString,
    PINECONE_INDEX: optionalString,
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    FIRECRAWL_API_KEY: optionalString,
    TAVILY_API_KEY: optionalString,
    MEM0_API_KEY: optionalString,
    TTS_PROVIDER: optionalString,
    STT_PROVIDER: optionalString,

    INNGEST_DEV: booleanFlag.default(false),
    INNGEST_EVENT_KEY: optionalString,
    INNGEST_SIGNING_KEY: optionalString,

    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),

    /**
     * How many proxies sit in front of the API. Rate limiting and abuse
     * controls key on the client IP, and behind a load balancer the socket
     * address is the balancer's — every caller would share one bucket. Setting
     * this too high is worse than too low: it lets a caller forge the address
     * they are limited by, so it has no default above zero.
     */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

    /**
     * Bearer token for the detailed health report and the metrics endpoint.
     * Both describe internal topology, so when this is unset the endpoints do
     * not exist rather than serving to anyone who asks.
     */
    OPS_TOKEN: optionalString,

    CHAT_DAILY_REQUEST_LIMIT: positiveInteger.default(100),
    CHAT_DAILY_TOKEN_LIMIT: positiveInteger.default(500_000),

    /**
     * Turns off the outbound address check that stops a user-supplied URL from
     * reaching a private network. Only for local development against a service
     * on the loopback interface; a production deployment that sets this has an
     * SSRF hole by configuration.
     */
    ALLOW_PRIVATE_NETWORK_FETCH: booleanFlag.default(false),
});

/** The validated environment. */
export type Env = z.infer<typeof envSchema>;

/**
 * Configuration a production deployment cannot start without.
 *
 * Development and test deliberately tolerate their absence so a contributor can
 * run the API with a subset of providers configured.
 */
const PRODUCTION_REQUIRED = [
    "CLERK_SECRET_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "CLERK_WEBHOOK_SIGNING_SECRET",
    "OPENAI_API_KEY",
    "PINECONE_API_KEY",
    "CLOUDINARY_CLOUD_NAME",
    "INNGEST_EVENT_KEY",
    "INNGEST_SIGNING_KEY",
] as const satisfies readonly (keyof Env)[];

/**
 * Environment problems, listed rather than thrown one at a time.
 *
 * A deployment with three missing secrets should learn about three, not
 * discover them one restart at a time.
 */
export class EnvironmentError extends Error {
    constructor(public readonly problems: readonly string[]) {
        super(`Invalid environment:\n  - ${problems.join("\n  - ")}`);
        this.name = "EnvironmentError";
    }
}

/**
 * Parses and validates an environment.
 *
 * @param source - Raw environment variables, normally `process.env`
 * @returns The validated environment
 * @throws {EnvironmentError} When a required variable is missing or malformed,
 * or when a production deployment is configured unsafely
 */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
    const parsed = envSchema.safeParse(source);

    if (!parsed.success) {
        throw new EnvironmentError(
            parsed.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            ),
        );
    }

    const env = parsed.data;
    const problems: string[] = [];

    if (env.NODE_ENV === "production") {
        for (const key of PRODUCTION_REQUIRED) {
            if (env[key] === undefined) {
                problems.push(`${key} is required in production`);
            }
        }

        if (env.INNGEST_DEV) {
            problems.push(
                "INNGEST_DEV must not be set in production: it disables job signature verification",
            );
        }

        if (env.ALLOW_PRIVATE_NETWORK_FETCH) {
            problems.push(
                "ALLOW_PRIVATE_NETWORK_FETCH must not be set in production: it disables the outbound address check",
            );
        }

        for (const origin of parseOrigins(env.CLIENT_URL)) {
            if (!origin.startsWith("https://")) {
                problems.push(
                    `CLIENT_URL entry "${origin}" must use https in production`,
                );
            }
        }
    }

    if (problems.length > 0) {
        throw new EnvironmentError(problems);
    }

    return env;
}

/**
 * Splits the configured origin list.
 *
 * @param value - Comma-separated origin list
 * @returns Origins with trailing slashes removed, so `https://x/` and
 * `https://x` are the same entry rather than a silent mismatch
 */
export function parseOrigins(value: string): readonly string[] {
    return value
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter((origin) => origin.length > 0);
}

let cached: Env | null = null;

/**
 * The validated environment, parsed on first use.
 *
 * @returns The environment
 * @throws {EnvironmentError} When the environment is invalid
 */
export function env(): Env {
    if (cached === null) {
        cached = parseEnv(process.env);
    }
    return cached;
}

/** Whether this process is running as a production deployment. */
export function isProduction(): boolean {
    return env().NODE_ENV === "production";
}

/** The exact browser origins allowed to call the API. */
export function allowedOrigins(): readonly string[] {
    return parseOrigins(env().CLIENT_URL);
}
