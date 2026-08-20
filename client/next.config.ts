import path from "node:path";
import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:8080";
const isProduction = process.env.NODE_ENV === "production";

/**
 * The API origin, as a CSP source.
 *
 * The browser talks to the API through the rewrites below, which are same-origin
 * from its point of view — but a streaming chat response and any signed media URL
 * still resolve to the API and storage hosts, so those have to be nameable.
 */
const apiOrigin = new URL(apiUrl).origin;

/**
 * The client's Content Security Policy.
 *
 * A real policy for a real app, which means it has to admit the things this app
 * genuinely does: Clerk's script and its frames for sign-in, Next's inline
 * bootstrap, and the storage host that serves signed media.
 *
 * `'unsafe-inline'` is present for styles and absent for scripts, which is the
 * distinction that matters. Inline styles are how Tailwind and the component
 * library set dynamic values, and they are not a script execution primitive.
 * Scripts get a strict source list instead, so an injected `<script>` has nowhere
 * to come from.
 *
 * `upgrade-insecure-requests` and `block-all-mixed-content` are production-only:
 * in development every request is plaintext http on localhost by design.
 */
const contentSecurityPolicy = [
    "default-src 'self'",
    // Clerk loads its interstitial and challenge scripts from its own hosts.
    "script-src 'self' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com https://img.clerk.com https://*.clerk.com",
    "media-src 'self' blob: https://res.cloudinary.com",
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin} https://*.clerk.accounts.dev https://*.clerk.com https://res.cloudinary.com`,
    // Clerk's sign-in and bot-protection challenges render in frames.
    "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    // Nothing in this product should ever be framed by another site.
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isProduction
        ? ["upgrade-insecure-requests", "block-all-mixed-content"]
        : []),
].join("; ");

const PERMISSIONS_POLICY = [
    "accelerometer=()",
    "autoplay=(self)",
    "camera=()",
    "display-capture=()",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    // Denied wholesale: nothing in the product records the reader.
    "microphone=()",
    "payment=()",
    "usb=()",
].join(", ");

/**
 * Container builds set `NEXT_OUTPUT=standalone`.
 *
 * Opted into by environment rather than switched on unconditionally, so a local
 * `bun run build` keeps producing what a developer expects and only the image
 * build pays for the traced bundle.
 */
const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
    // The framework version is a free hint to anyone deciding which exploit to
    // try, and removing it costs nothing.
    poweredByHeader: false,

    ...(standalone
        ? {
              output: "standalone" as const,
              // File tracing has to start at the workspace root, or the
              // contracts package this app imports is left out of the bundle
              // and the container starts and then fails on first render.
              outputFileTracingRoot: path.join(import.meta.dirname, ".."),
          }
        : {}),

    async headers() {
        return [
            {
                source: "/:path*",
                headers: [
                    {
                        key: "Content-Security-Policy",
                        value: contentSecurityPolicy,
                    },
                    { key: "X-Content-Type-Options", value: "nosniff" },
                    { key: "X-Frame-Options", value: "DENY" },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
                    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
                    { key: "Origin-Agent-Cluster", value: "?1" },
                    ...(isProduction
                        ? [
                              {
                                  key: "Strict-Transport-Security",
                                  value: "max-age=63072000; includeSubDomains; preload",
                              },
                          ]
                        : []),
                ],
            },
            // Redeeming a link is a bearer capability in a URL, and the
            // settings pages describe one account's data and carry signed export
            // links. None of it may be cached or indexed — the invite and share
            // entries match `SHARE_LINKS_ARE_INDEXABLE` in the contracts package.
            ...["/invite/:path*", "/share/:path*", "/settings/:path*"].map(
                (source) => ({
                    source,
                    headers: [
                        { key: "Cache-Control", value: "no-store, max-age=0" },
                        {
                            key: "X-Robots-Tag",
                            value: "noindex, nofollow, noarchive",
                        },
                    ],
                }),
            ),
        ];
    },

    async rewrites() {
        return [
            {
                source: "/api/workspaces/:path*",
                destination: `${apiUrl}/api/workspaces/:path*`,
            },
            {
                source: "/api/workspaces",
                destination: `${apiUrl}/api/workspaces`,
            },
            {
                source: "/api/memory/:path*",
                destination: `${apiUrl}/api/memory/:path*`,
            },
            {
                source: "/api/memory",
                destination: `${apiUrl}/api/memory`,
            },
            {
                source: "/api/privacy/:path*",
                destination: `${apiUrl}/api/privacy/:path*`,
            },
            {
                source: "/api/invitations/:path*",
                destination: `${apiUrl}/api/invitations/:path*`,
            },
            {
                source: "/api/share-links/:path*",
                destination: `${apiUrl}/api/share-links/:path*`,
            },
            {
                source: "/api/capabilities",
                destination: `${apiUrl}/api/capabilities`,
            },
        ];
    },
};

export default nextConfig;
