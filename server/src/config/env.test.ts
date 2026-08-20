import { describe, expect, test } from "bun:test";
import { EnvironmentError, parseEnv, parseOrigins } from "./env.js";

/** The minimum a development process needs to boot. */
const MINIMAL: NodeJS.ProcessEnv = {
    DATABASE_URL: "postgresql://localhost:5432/test",
};

/** Everything a production deployment is required to carry. */
const PRODUCTION: NodeJS.ProcessEnv = {
    ...MINIMAL,
    NODE_ENV: "production",
    CLIENT_URL: "https://app.example.com",
    CLERK_SECRET_KEY: "sk_live_x",
    CLERK_PUBLISHABLE_KEY: "pk_live_x",
    CLERK_WEBHOOK_SIGNING_SECRET: "whsec_x",
    OPENAI_API_KEY: "sk-x",
    PINECONE_API_KEY: "pc-x",
    CLOUDINARY_CLOUD_NAME: "cloud",
    INNGEST_EVENT_KEY: "evt",
    INNGEST_SIGNING_KEY: "sign",
};

describe("environment parsing", () => {
    test("a development environment needs only a database", () => {
        const env = parseEnv(MINIMAL);
        expect(env.NODE_ENV).toBe("development");
        expect(env.PORT).toBe(8080);
        expect(env.CLIENT_URL).toBe("http://localhost:3000");
    });

    test("a missing database URL is refused", () => {
        expect(() => parseEnv({})).toThrow(EnvironmentError);
    });

    test("a blank optional provider key reads as unconfigured", () => {
        const env = parseEnv({ ...MINIMAL, TAVILY_API_KEY: "   " });
        expect(env.TAVILY_API_KEY).toBeUndefined();
    });

    test("numeric settings are coerced and bounded", () => {
        const env = parseEnv({ ...MINIMAL, PORT: "3001", TRUST_PROXY_HOPS: "2" });
        expect(env.PORT).toBe(3001);
        expect(env.TRUST_PROXY_HOPS).toBe(2);
    });

    test("proxy trust defaults to zero, never to blanket trust", () => {
        expect(parseEnv(MINIMAL).TRUST_PROXY_HOPS).toBe(0);
    });

    test("a nonsensical port is refused rather than silently defaulted", () => {
        expect(() => parseEnv({ ...MINIMAL, PORT: "99999" })).toThrow(
            EnvironmentError,
        );
    });
});

describe("production requirements", () => {
    test("a fully configured production environment is accepted", () => {
        expect(parseEnv(PRODUCTION).NODE_ENV).toBe("production");
    });

    test("every missing secret is reported, not just the first", () => {
        const { CLERK_SECRET_KEY, OPENAI_API_KEY, ...rest } = PRODUCTION;
        void CLERK_SECRET_KEY;
        void OPENAI_API_KEY;

        try {
            parseEnv(rest);
            throw new Error("expected a rejection");
        } catch (error) {
            expect(error).toBeInstanceOf(EnvironmentError);
            const problems =
                error instanceof EnvironmentError ? error.problems : [];
            expect(problems.length).toBe(2);
            expect(problems.join("\n")).toContain("CLERK_SECRET_KEY");
            expect(problems.join("\n")).toContain("OPENAI_API_KEY");
        }
    });

    test("the job runner's dev mode cannot be enabled in production", () => {
        expect(() => parseEnv({ ...PRODUCTION, INNGEST_DEV: "1" })).toThrow(
            EnvironmentError,
        );
    });

    test("the outbound address check cannot be disabled in production", () => {
        expect(() =>
            parseEnv({ ...PRODUCTION, ALLOW_PRIVATE_NETWORK_FETCH: "true" }),
        ).toThrow(EnvironmentError);
    });

    test("a plaintext client origin is refused in production", () => {
        expect(() =>
            parseEnv({ ...PRODUCTION, CLIENT_URL: "http://app.example.com" }),
        ).toThrow(EnvironmentError);
    });

    test("one bad origin in a list is enough to refuse", () => {
        expect(() =>
            parseEnv({
                ...PRODUCTION,
                CLIENT_URL: "https://app.example.com,http://staging.example.com",
            }),
        ).toThrow(EnvironmentError);
    });

    test("development tolerates the settings production refuses", () => {
        const env = parseEnv({
            ...MINIMAL,
            INNGEST_DEV: "1",
            ALLOW_PRIVATE_NETWORK_FETCH: "1",
        });
        expect(env.INNGEST_DEV).toBe(true);
        expect(env.ALLOW_PRIVATE_NETWORK_FETCH).toBe(true);
    });
});

describe("origin list", () => {
    test("entries are split and trimmed", () => {
        expect(parseOrigins("https://a.com, https://b.com")).toEqual([
            "https://a.com",
            "https://b.com",
        ]);
    });

    test("a trailing slash does not create a second, non-matching origin", () => {
        expect(parseOrigins("https://a.com/")).toEqual(["https://a.com"]);
    });

    test("empty entries are dropped", () => {
        expect(parseOrigins("https://a.com,,")).toEqual(["https://a.com"]);
    });
});
