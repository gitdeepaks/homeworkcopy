/**
 * In-process instruments, rendered in Prometheus text format.
 *
 * Written rather than pulled in because the requirement is small and the shape
 * matters: label names are part of an instrument's type, so a call site cannot
 * invent a label, misspell one, or omit one. A metric with an unbounded label
 * set is the standard way to take down a metrics backend, and the type system is
 * a cheaper guard against it than a code review.
 *
 * Values live in this process. With more than one API instance the scrape is
 * per-instance, which is what a Prometheus-compatible scraper expects — it sums
 * across targets. Nothing here is a substitute for the provider's own billing:
 * {@link recordProviderCost} records what we *believe* we spent, which is the
 * number that tells you a feature's unit economics an hour after shipping it
 * rather than at the end of the month.
 */

/** Values for a fixed set of label names. */
type Labels<Names extends readonly string[]> = {
    readonly [Name in Names[number]]: string;
};

/**
 * Escapes a label value for the text exposition format.
 *
 * @param value - Raw label value
 * @returns The value with backslashes, quotes, and newlines escaped
 */
function escapeLabelValue(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n");
}

/**
 * Renders a label set as a stable key.
 *
 * Names are sorted so the same labels supplied in a different order are the
 * same series rather than two.
 *
 * @param labelNames - The instrument's declared label names
 * @param labels - Values for those names
 * @returns The `{a="1",b="2"}` suffix, or `""` when there are no labels
 */
function renderLabels(
    labelNames: readonly string[],
    labels: Readonly<Record<string, string>>,
): string {
    if (labelNames.length === 0) return "";
    const parts = [...labelNames]
        .sort()
        .map((name) => `${name}="${escapeLabelValue(labels[name] ?? "")}"`);
    return `{${parts.join(",")}}`;
}

/**
 * A monotonically increasing count.
 *
 * @typeParam Names - The label names every observation must supply
 */
export class Counter<const Names extends readonly string[]> {
    private readonly series = new Map<string, number>();

    constructor(
        readonly name: string,
        readonly help: string,
        readonly labelNames: Names,
    ) {}

    /**
     * Adds to a series.
     *
     * @param labels - Values for every declared label name
     * @param value - Amount to add; defaults to one
     */
    inc(labels: Labels<Names>, value = 1): void {
        const key = renderLabels(this.labelNames, labels);
        this.series.set(key, (this.series.get(key) ?? 0) + value);
    }

    /** @returns The current value of a series, or zero if never observed */
    get(labels: Labels<Names>): number {
        return this.series.get(renderLabels(this.labelNames, labels)) ?? 0;
    }

    /** @returns The instrument in Prometheus text format */
    render(): string {
        const lines = [
            `# HELP ${this.name} ${this.help}`,
            `# TYPE ${this.name} counter`,
        ];
        for (const [key, value] of this.series) {
            lines.push(`${this.name}${key} ${value}`);
        }
        return lines.join("\n");
    }
}

/** Bucket boundaries in seconds, spanning a fast database read to a slow model call. */
const DEFAULT_BUCKETS: readonly number[] = [
    0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120,
];

type HistogramSeries = {
    counts: number[];
    sum: number;
    count: number;
};

/**
 * A distribution of durations.
 *
 * @typeParam Names - The label names every observation must supply
 */
export class Histogram<const Names extends readonly string[]> {
    private readonly series = new Map<string, HistogramSeries>();

    constructor(
        readonly name: string,
        readonly help: string,
        readonly labelNames: Names,
        readonly buckets: readonly number[] = DEFAULT_BUCKETS,
    ) {}

    /**
     * Records one observation.
     *
     * @param labels - Values for every declared label name
     * @param seconds - The observed duration
     */
    observe(labels: Labels<Names>, seconds: number): void {
        const key = renderLabels(this.labelNames, labels);
        const existing = this.series.get(key) ?? {
            counts: this.buckets.map(() => 0),
            sum: 0,
            count: 0,
        };

        for (const [index, boundary] of this.buckets.entries()) {
            if (seconds <= boundary) {
                const current = existing.counts[index] ?? 0;
                existing.counts[index] = current + 1;
            }
        }
        existing.sum += seconds;
        existing.count += 1;
        this.series.set(key, existing);
    }

    /** @returns The instrument in Prometheus text format */
    render(): string {
        const lines = [
            `# HELP ${this.name} ${this.help}`,
            `# TYPE ${this.name} histogram`,
        ];

        for (const [key, entry] of this.series) {
            const inner = key === "" ? "" : key.slice(1, -1);
            const withLe = (le: string) =>
                inner === "" ? `{le="${le}"}` : `{${inner},le="${le}"}`;

            for (const [index, boundary] of this.buckets.entries()) {
                lines.push(
                    `${this.name}_bucket${withLe(String(boundary))} ${entry.counts[index] ?? 0}`,
                );
            }
            lines.push(`${this.name}_bucket${withLe("+Inf")} ${entry.count}`);
            lines.push(`${this.name}_sum${key} ${entry.sum}`);
            lines.push(`${this.name}_count${key} ${entry.count}`);
        }

        return lines.join("\n");
    }
}

/**
 * The instruments the product actually reports.
 *
 * Chosen to answer the questions an on-call engineer asks first: is the API
 * serving, are sources getting through, are answers being produced, how old is
 * the oldest queued job, and what is any of it costing.
 */
export const httpRequests = new Counter(
    "homeworkcopy_http_requests_total",
    "API requests by route template, method, and status class.",
    ["route", "method", "status"] as const,
);

export const httpRequestDuration = new Histogram(
    "homeworkcopy_http_request_duration_seconds",
    "API request latency by route template.",
    ["route", "method"] as const,
);

export const sourceProcessing = new Counter(
    "homeworkcopy_source_processing_total",
    "Source ingestion outcomes by source type and failure code.",
    ["type", "outcome", "code"] as const,
);

export const sourceProcessingDuration = new Histogram(
    "homeworkcopy_source_processing_duration_seconds",
    "End-to-end source ingestion time by source type.",
    ["type"] as const,
);

export const chatTurns = new Counter(
    "homeworkcopy_chat_turns_total",
    "Chat turns by grounding mode and outcome.",
    ["groundingMode", "outcome"] as const,
);

export const outputGeneration = new Counter(
    "homeworkcopy_output_generation_total",
    "Studio output generation outcomes by output type and failure code.",
    ["type", "outcome", "code"] as const,
);

export const providerCalls = new Counter(
    "homeworkcopy_provider_calls_total",
    "Outbound provider calls by provider, operation, and outcome.",
    ["provider", "operation", "outcome"] as const,
);

export const providerLatency = new Histogram(
    "homeworkcopy_provider_latency_seconds",
    "Outbound provider call latency by provider and operation.",
    ["provider", "operation"] as const,
);

export const providerCostUsd = new Counter(
    "homeworkcopy_provider_cost_usd_total",
    "Estimated spend in US dollars by provider and product feature.",
    ["provider", "feature"] as const,
);

export const jobQueueAgeSeconds = new Histogram(
    "homeworkcopy_job_queue_age_seconds",
    "How long a job waited before a worker picked it up.",
    ["job"] as const,
);

export const privacyOperations = new Counter(
    "homeworkcopy_privacy_operations_total",
    "Export, deletion, and retention outcomes.",
    ["operation", "outcome"] as const,
);

export const retentionPurged = new Counter(
    "homeworkcopy_retention_purged_total",
    "Rows removed by the retention job, by resource.",
    ["resource"] as const,
);

const INSTRUMENTS: readonly { render(): string }[] = [
    httpRequests,
    httpRequestDuration,
    sourceProcessing,
    sourceProcessingDuration,
    chatTurns,
    outputGeneration,
    providerCalls,
    providerLatency,
    providerCostUsd,
    jobQueueAgeSeconds,
    privacyOperations,
    retentionPurged,
];

/**
 * Renders every instrument for a scrape.
 *
 * @returns The full exposition, newline-terminated
 */
export function renderMetrics(): string {
    return `${INSTRUMENTS.map((instrument) => instrument.render()).join("\n")}\n`;
}

/**
 * Collapses a status code to its class.
 *
 * The individual code is on the log line; the metric only needs the class, and
 * keeping it to five values keeps the series count bounded.
 *
 * @param statusCode - HTTP status code
 * @returns `"2xx"`, `"4xx"`, and so on
 */
export function statusClass(statusCode: number): string {
    return `${Math.floor(statusCode / 100)}xx`;
}

/**
 * Times a provider call and records its latency and outcome.
 *
 * @param provider - Provider being called
 * @param operation - What was asked of it
 * @param call - The call itself
 * @returns Whatever the call returns
 */
export async function instrumentProviderCall<T>(
    provider: string,
    operation: string,
    call: () => Promise<T>,
): Promise<T> {
    const startedAt = performance.now();
    try {
        const result = await call();
        providerCalls.inc({ provider, operation, outcome: "success" });
        return result;
    } catch (error) {
        providerCalls.inc({ provider, operation, outcome: "failure" });
        throw error;
    } finally {
        providerLatency.observe(
            { provider, operation },
            (performance.now() - startedAt) / 1000,
        );
    }
}
