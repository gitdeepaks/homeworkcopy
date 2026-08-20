import { describe, expect, test } from "bun:test";
import {
    BlockedUrlError,
    isPublicAddress,
    parsePublicUrl,
} from "./url-guard.js";

describe("address classification", () => {
    test("ordinary public addresses are allowed", () => {
        expect(isPublicAddress("93.184.216.34")).toBe(true);
        expect(isPublicAddress("8.8.8.8")).toBe(true);
        expect(isPublicAddress("2606:2800:220:1:248:1893:25c8:1946")).toBe(true);
    });

    test("loopback is refused in both families", () => {
        expect(isPublicAddress("127.0.0.1")).toBe(false);
        expect(isPublicAddress("127.99.1.2")).toBe(false);
        expect(isPublicAddress("::1")).toBe(false);
    });

    test("the cloud metadata address is refused", () => {
        expect(isPublicAddress("169.254.169.254")).toBe(false);
    });

    test("RFC 1918 ranges are refused", () => {
        expect(isPublicAddress("10.0.0.1")).toBe(false);
        expect(isPublicAddress("172.16.0.1")).toBe(false);
        expect(isPublicAddress("172.31.255.255")).toBe(false);
        expect(isPublicAddress("192.168.1.1")).toBe(false);
    });

    test("addresses adjacent to a private range are still public", () => {
        expect(isPublicAddress("172.15.0.1")).toBe(true);
        expect(isPublicAddress("172.32.0.1")).toBe(true);
        expect(isPublicAddress("11.0.0.1")).toBe(true);
        expect(isPublicAddress("192.167.1.1")).toBe(true);
    });

    test("carrier-grade NAT is refused", () => {
        expect(isPublicAddress("100.64.0.1")).toBe(false);
        expect(isPublicAddress("100.127.255.255")).toBe(false);
        expect(isPublicAddress("100.63.255.255")).toBe(true);
        expect(isPublicAddress("100.128.0.1")).toBe(true);
    });

    test("this-network, multicast, and reserved are refused", () => {
        expect(isPublicAddress("0.0.0.0")).toBe(false);
        expect(isPublicAddress("224.0.0.1")).toBe(false);
        expect(isPublicAddress("255.255.255.255")).toBe(false);
    });

    test("an IPv4-mapped IPv6 address is judged as the IPv4 it names", () => {
        expect(isPublicAddress("::ffff:127.0.0.1")).toBe(false);
        expect(isPublicAddress("::ffff:169.254.169.254")).toBe(false);
        expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
    });

    test("IPv6 link-local and unique-local are refused", () => {
        expect(isPublicAddress("fe80::1")).toBe(false);
        expect(isPublicAddress("fd00::1")).toBe(false);
        expect(isPublicAddress("fc00::1")).toBe(false);
    });

    test("something that is not an address at all is refused", () => {
        expect(isPublicAddress("not-an-address")).toBe(false);
        expect(isPublicAddress("")).toBe(false);
    });
});

describe("URL shape", () => {
    test("http and https are accepted", () => {
        expect(parsePublicUrl("https://example.com/page").hostname).toBe(
            "example.com",
        );
        expect(parsePublicUrl("http://example.com").protocol).toBe("http:");
    });

    test("other schemes are refused", () => {
        for (const value of [
            "file:///etc/passwd",
            "gopher://example.com",
            "ftp://example.com",
            "data:text/plain,hello",
        ]) {
            expect(() => parsePublicUrl(value)).toThrow(BlockedUrlError);
        }
    });

    test("embedded credentials are refused", () => {
        expect(() =>
            parsePublicUrl("http://user:pass@example.com/"),
        ).toThrow(BlockedUrlError);
        expect(() => parsePublicUrl("http://admin@169.254.169.254/")).toThrow(
            BlockedUrlError,
        );
    });

    test("non-web ports are refused", () => {
        expect(() => parsePublicUrl("http://example.com:22/")).toThrow(
            BlockedUrlError,
        );
        expect(() => parsePublicUrl("http://example.com:6379/")).toThrow(
            BlockedUrlError,
        );
        // The default port for a scheme is normalized away by `URL`, so these
        // parse to a bare host and are accepted.
        expect(parsePublicUrl("https://example.com:443/").hostname).toBe(
            "example.com",
        );
        expect(parsePublicUrl("http://example.com:80/").hostname).toBe(
            "example.com",
        );
        expect(parsePublicUrl("http://example.com:443/").port).toBe("443");
    });

    test("localhost is refused without a DNS lookup", () => {
        for (const value of [
            "http://localhost/",
            "http://LOCALHOST/",
            "http://api.localhost/",
            "http://localhost./",
        ]) {
            expect(() => parsePublicUrl(value)).toThrow(BlockedUrlError);
        }
    });

    test("a malformed URL is refused rather than throwing a TypeError", () => {
        expect(() => parsePublicUrl("not a url")).toThrow(BlockedUrlError);
    });

    test("a blocked URL is a validation error, so it reaches the reader as 400", () => {
        try {
            parsePublicUrl("file:///etc/passwd");
            throw new Error("expected a rejection");
        } catch (error) {
            expect(error).toBeInstanceOf(BlockedUrlError);
            expect(error instanceof BlockedUrlError && error.statusCode).toBe(
                400,
            );
        }
    });
});
