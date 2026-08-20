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
 *
 * Scripts are admitted by nonce instead. Next renders a handful of inline
 * scripts it cannot do without — the request id, the flight payload, the theme
 * initializer — and a policy that simply omits `'unsafe-inline'` blocks them,
 * which stops the app hydrating at all. Each response therefore carries a fresh
 * nonce, minted in `proxy.ts` and stamped on every script Next and Clerk emit,
 * so an injected `<script>` still has nowhere to come from: it cannot guess the
 * nonce, and the host list admits only Clerk.
 *
 * `upgrade-insecure-requests` and `block-all-mixed-content` are production-only:
 * in development every request is plaintext http on localhost by design.
 */

const isProduction = process.env.NODE_ENV === "production";

/**
 * The API origin, as a CSP source.
 *
 * The browser talks to the API through the rewrites in `next.config.ts`, which
 * are same-origin from its point of view — but a streaming chat response and any
 * signed media URL still resolve to the API and storage hosts, so those have to
 * be nameable.
 */
const apiOrigin = new URL(process.env["API_URL"] ?? "http://localhost:8080").origin;

/** A fresh base64 nonce. One per response; never reused across requests. */
export function generateNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes));
}

/** The policy for one response, bound to that response's script nonce. */
export function contentSecurityPolicy(nonce: string): string {
    return [
        "default-src 'self'",
        // Next's own inline bootstrap and Clerk's injected script tags carry
        // this nonce.
        `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://res.cloudinary.com https://img.clerk.com https://*.clerk.com",
        "media-src 'self' blob: https://res.cloudinary.com",
        "font-src 'self' data:",
        `connect-src 'self' ${apiOrigin} https://*.clerk.accounts.dev https://*.clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com https://res.cloudinary.com`,
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
}
