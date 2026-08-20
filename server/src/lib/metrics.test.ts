import { describe, expect, test } from "bun:test";
import { Counter, Histogram, statusClass } from "./metrics.js";
import {
    estimateCallCostUsd,
    estimateDurationCostUsd,
    estimateTokenCostUsd,
} from "./cost.js";

describe("counter", () => {
    test("counts by label set", () => {
        const counter = new Counter("test_total", "help", ["route"] as const);
        counter.inc({ route: "/a" });
        counter.inc({ route: "/a" });
        counter.inc({ route: "/b" }, 3);

        expect(counter.get({ route: "/a" })).toBe(2);
        expect(counter.get({ route: "/b" })).toBe(3);
        expect(counter.get({ route: "/never" })).toBe(0);
    });

    test("label order does not create a second series", () => {
        const counter = new Counter("test_total", "help", [
            "a",
            "b",
        ] as const);
        counter.inc({ a: "1", b: "2" });
        counter.inc({ b: "2", a: "1" });

        expect(counter.get({ a: "1", b: "2" })).toBe(2);
        expect(counter.render().split("\n").length).toBe(3);
    });

    test("renders Prometheus text format", () => {
        const counter = new Counter("test_total", "A help line.", [
            "route",
        ] as const);
        counter.inc({ route: "/a" }, 5);

        expect(counter.render()).toBe(
            [
                "# HELP test_total A help line.",
                "# TYPE test_total counter",
                'test_total{route="/a"} 5',
            ].join("\n"),
        );
    });

    test("a label value containing a quote cannot break out of the label set", () => {
        const counter = new Counter("test_total", "help", ["route"] as const);
        counter.inc({ route: 'a"} evil{x="' });

        expect(counter.render()).toContain('route="a\\"} evil{x=\\""');
    });
});

describe("histogram", () => {
    test("observations land in every bucket at or above them", () => {
        const histogram = new Histogram(
            "test_seconds",
            "help",
            ["op"] as const,
            [1, 5],
        );
        histogram.observe({ op: "x" }, 0.5);
        histogram.observe({ op: "x" }, 3);
        histogram.observe({ op: "x" }, 10);

        const rendered = histogram.render();
        expect(rendered).toContain('test_seconds_bucket{op="x",le="1"} 1');
        expect(rendered).toContain('test_seconds_bucket{op="x",le="5"} 2');
        expect(rendered).toContain('test_seconds_bucket{op="x",le="+Inf"} 3');
        expect(rendered).toContain('test_seconds_count{op="x"} 3');
        expect(rendered).toContain('test_seconds_sum{op="x"} 13.5');
    });
});

describe("status class", () => {
    test("collapses codes to their class so the series count stays bounded", () => {
        expect(statusClass(200)).toBe("2xx");
        expect(statusClass(204)).toBe("2xx");
        expect(statusClass(404)).toBe("4xx");
        expect(statusClass(503)).toBe("5xx");
    });
});

describe("cost estimation", () => {
    test("prices a token-billed call from the rate card", () => {
        // 1M in at $0.15 plus 1M out at $0.60.
        expect(
            estimateTokenCostUsd("gpt-4o-mini", 1_000_000, 1_000_000),
        ).toBeCloseTo(0.75, 6);
    });

    test("an unpriced model reports zero rather than failing a request", () => {
        expect(estimateTokenCostUsd("some-future-model", 1_000, 1_000)).toBe(0);
    });

    test("negative token counts cannot produce a credit", () => {
        expect(estimateTokenCostUsd("gpt-4o-mini", -1_000_000, 0)).toBe(0);
    });

    test("prices a duration-billed call", () => {
        expect(estimateDurationCostUsd("whisper-1", 600)).toBeCloseTo(0.06, 6);
    });

    test("prices a per-request provider", () => {
        expect(estimateCallCostUsd("tavily", 10)).toBeCloseTo(0.08, 6);
        expect(estimateCallCostUsd("unknown-provider", 10)).toBe(0);
    });
});
