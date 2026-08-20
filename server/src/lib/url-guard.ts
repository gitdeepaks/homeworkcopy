/**
 * The outbound address check.
 *
 * Several endpoints take a URL from a reader and fetch it: importing a website,
 * importing a YouTube video, re-downloading a stored PDF. Without this, any of
 * them is a request forgery primitive — the API sits inside a private network
 * with a database, a metadata service at `169.254.169.254`, and whatever else
 * the platform exposes on the loopback interface, and it will happily fetch any
 * of them on a stranger's behalf.
 *
 * Two properties make this hard to get right, and both are handled here:
 *
 * - **A hostname is not an address.** `localtest.me` resolves to `127.0.0.1`,
 *   and an attacker's own domain can resolve to anything they like. Blocking
 *   literal `localhost` catches nothing, so every hostname is resolved and every
 *   address it resolves to is checked.
 * - **A redirect is a second request.** A public URL that 302s to
 *   `http://169.254.169.254/` defeats a check performed only on the URL the
 *   reader supplied, so {@link guardedFetch} follows redirects itself and
 *   re-checks each hop.
 *
 * This closes the hole for fetches this process makes. Requests made on our
 * behalf by an external scraper leave from that vendor's network, not ours, so
 * the check there is about not handing a reader a private-network probe, which
 * it still does.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "../config/env.js";
import { ValidationError } from "../types/app-error.js";

/** How many redirects a guarded fetch will follow before giving up. */
const MAX_REDIRECTS = 5;

/**
 * Ports a reader-supplied URL may target.
 *
 * An allowlist rather than a denylist: the interesting internal services are on
 * ports nobody needs to reach from a source import, and enumerating them all
 * correctly is not a thing anyone has ever finished doing.
 */
const ALLOWED_PORTS: ReadonlySet<number> = new Set([80, 443]);

export class BlockedUrlError extends ValidationError {
    constructor(message: string) {
        super(message);
        this.name = "BlockedUrlError";
    }
}

/**
 * Whether an IPv4 address is outside the public internet.
 *
 * @param octets - The four octets, in order
 * @returns `true` when the address is private, local, or otherwise reserved
 */
function isPrivateIpv4(octets: readonly number[]): boolean {
    const [a, b] = octets;
    if (a === undefined || b === undefined) return true;

    // 0.0.0.0/8 — "this network", and on Linux a synonym for localhost.
    if (a === 0) return true;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 127.0.0.0/8 — loopback.
    if (a === 127) return true;
    // 169.254.0.0/16 — link-local, which is where cloud metadata services live.
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 — IETF protocol assignments.
    if (a === 192 && b === 0) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 — carrier-grade NAT, used as the internal range by several
    // container platforms.
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 198.18.0.0/15 — benchmarking.
    if (a === 198 && b >= 18 && b <= 19) return true;
    // 224.0.0.0/4 multicast and 240.0.0.0/4 reserved, which includes broadcast.
    if (a >= 224) return true;

    return false;
}

/**
 * Whether an IPv6 address is outside the public internet.
 *
 * IPv4-mapped addresses (`::ffff:127.0.0.1`) are unwrapped and checked as IPv4,
 * because a dual-stack resolver returning one is the same host by another name.
 *
 * @param address - IPv6 address in any accepted textual form
 * @returns `true` when the address is loopback, link-local, unique-local, or
 * reserved
 */
function isPrivateIpv6(address: string): boolean {
    const normalized = address.toLowerCase().split("%")[0] ?? "";

    const mapped = /^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
    if (mapped?.[1] !== undefined) {
        return isPrivateIpv4(mapped[1].split(".").map(Number));
    }

    // ::, ::1
    if (normalized === "::" || normalized === "::1") return true;
    // fe80::/10 link-local, fec0::/10 site-local (deprecated but still routed).
    if (/^fe[89ab]/.test(normalized)) return true;
    if (/^fe[cdef]/.test(normalized)) return true;
    // fc00::/7 unique local.
    if (/^f[cd]/.test(normalized)) return true;
    // ::ffff:0:0/96 without dotted-quad form, and other IPv4 compatibility
    // ranges that tunnel to an IPv4 destination we cannot see here.
    if (normalized.startsWith("64:ff9b:")) return true;
    if (normalized.startsWith("2002:")) return true;

    return false;
}

/**
 * Whether a resolved address may be connected to.
 *
 * @param address - A literal IPv4 or IPv6 address
 * @returns `true` when the address is on the public internet
 */
export function isPublicAddress(address: string): boolean {
    const version = isIP(address);

    if (version === 4) {
        return !isPrivateIpv4(address.split(".").map(Number));
    }
    if (version === 6) {
        return !isPrivateIpv6(address);
    }

    // Not an address at all. Refusing is the only safe answer.
    return false;
}

/** A URL that has passed every check, along with what it resolved to. */
export type GuardedUrl = {
    url: URL;
    addresses: readonly string[];
};

/**
 * Checks the parts of a URL that need no network access.
 *
 * Separated from resolution so it can be unit-tested without DNS, and so a
 * malformed URL is rejected before a lookup is spent on it.
 *
 * @param value - The URL as supplied
 * @returns The parsed URL
 * @throws {BlockedUrlError} When the scheme, credentials, port, or host are not
 * acceptable
 */
export function parsePublicUrl(value: string): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new BlockedUrlError("That does not look like a valid URL.");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new BlockedUrlError("Only http and https addresses can be opened.");
    }

    // `http://user:pass@host/` is how a URL smuggles credentials past a reader
    // skimming it, and past a naive host check that stops at the first `@`.
    if (url.username !== "" || url.password !== "") {
        throw new BlockedUrlError("Addresses with embedded credentials are not accepted.");
    }

    const port =
        url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);

    if (!ALLOWED_PORTS.has(port)) {
        throw new BlockedUrlError("Only the standard web ports can be reached.");
    }

    if (url.hostname === "") {
        throw new BlockedUrlError("That address has no host.");
    }

    // `.localhost` is reserved for loopback by RFC 6761 and resolvers honour it
    // without ever asking DNS, so no lookup would catch it.
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
        throw new BlockedUrlError("That address points at this server.");
    }

    return url;
}

/**
 * Resolves a URL's host and refuses it if any address is not public.
 *
 * Every address is checked, not just the first: a host with one public and one
 * loopback address must be refused, because which one a later connection uses
 * is not ours to decide.
 *
 * @param value - The URL as supplied by a reader
 * @returns The parsed URL and the addresses it resolved to
 * @throws {BlockedUrlError} When the URL is malformed, or resolves to an address
 * outside the public internet
 */
export async function assertPublicUrl(value: string): Promise<GuardedUrl> {
    const url = parsePublicUrl(value);

    if (env().ALLOW_PRIVATE_NETWORK_FETCH) {
        return { url, addresses: [] };
    }

    const literal = isIP(url.hostname);
    if (literal !== 0) {
        if (!isPublicAddress(url.hostname)) {
            throw new BlockedUrlError("That address points at a private network.");
        }
        return { url, addresses: [url.hostname] };
    }

    let resolved: readonly { address: string }[];
    try {
        resolved = await lookup(url.hostname, { all: true, verbatim: true });
    } catch {
        throw new BlockedUrlError("That address could not be resolved.");
    }

    if (resolved.length === 0) {
        throw new BlockedUrlError("That address could not be resolved.");
    }

    for (const { address } of resolved) {
        if (!isPublicAddress(address)) {
            throw new BlockedUrlError("That address points at a private network.");
        }
    }

    return { url, addresses: resolved.map((entry) => entry.address) };
}

/**
 * Fetches a reader-supplied URL, checking every hop.
 *
 * Redirects are followed here rather than by `fetch`, because `fetch` would
 * follow a 302 into a private network without asking. Each hop is re-checked
 * with {@link assertPublicUrl}, so the guarantee holds for the address actually
 * connected to and not merely the one that was typed.
 *
 * There is still a window between the check and the connection in which DNS
 * could change under us. Closing it entirely means pinning the connection to a
 * verified address, which Node's fetch does not expose; the residual risk is a
 * single request to an attacker-chosen internal address with no response body
 * returned to them, and it is documented rather than hidden.
 *
 * @param value - The URL as supplied
 * @param init - Standard fetch options; `redirect` is always overridden
 * @returns The final response
 * @throws {BlockedUrlError} When any hop fails the address check, or there are
 * too many redirects
 */
export async function guardedFetch(
    value: string,
    init: RequestInit = {},
): Promise<Response> {
    let target = value;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        const { url } = await assertPublicUrl(target);
        const response = await fetch(url, { ...init, redirect: "manual" });

        const isRedirect =
            response.status >= 300 &&
            response.status <= 399 &&
            response.headers.has("location");

        if (!isRedirect) {
            return response;
        }

        const location = response.headers.get("location");
        if (location === null) {
            return response;
        }

        target = new URL(location, url).toString();
    }

    throw new BlockedUrlError("That address redirected too many times.");
}
