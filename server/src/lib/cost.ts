/**
 * What a request cost, attributed to the feature that made it.
 *
 * Provider invoices arrive monthly, aggregated by API key, and tell you nothing
 * about which feature spent the money. This turns each call into an estimate
 * tagged with the feature that made it, so "what does one Audio Overview cost?"
 * and "which feature grew 4× this week?" are answerable the day a change ships.
 *
 * The estimate is deliberately an estimate. Prices move, and a stale table
 * silently reporting a wrong number is worse than one that is known to be
 * approximate — so the rate card carries the date it was checked, and the
 * invoice stays the source of truth for what is actually owed.
 */

import { providerCostUsd } from "./metrics.js";

/** When the rates below were last checked against public pricing. */
export const RATE_CARD_CHECKED_ON = "2026-08-20";

/**
 * Product features that spend provider budget.
 *
 * Cost is attributed to a feature rather than a route, because "chat" is a
 * meaningful unit to reason about and `POST /api/workspaces/:id/chat` is not.
 */
export const COST_FEATURES = [
    "chat",
    "embedding",
    "output",
    "audioOverview",
    "videoExplainer",
    "transcription",
    "sourceImport",
    "webSearch",
    "memory",
] as const;

export type CostFeature = (typeof COST_FEATURES)[number];

/** US dollars per million tokens. */
type TokenRate = {
    readonly inputPerMillion: number;
    readonly outputPerMillion: number;
};

/**
 * Token rates by model id.
 *
 * A model missing from this table is billed at zero rather than crashing a
 * request: an unpriced model should show up as a gap in a dashboard, never as a
 * failed answer for a reader.
 */
const TOKEN_RATES: Readonly<Record<string, TokenRate>> = {
    "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
    "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8 },
    "gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6 },
    "text-embedding-3-small": { inputPerMillion: 0.02, outputPerMillion: 0 },
    "text-embedding-3-large": { inputPerMillion: 0.13, outputPerMillion: 0 },
    "gpt-4o-mini-tts": { inputPerMillion: 0.6, outputPerMillion: 12 },
    "whisper-1": { inputPerMillion: 0, outputPerMillion: 0 },
};

/** US dollars per minute, for providers that bill by duration rather than tokens. */
const MINUTE_RATES: Readonly<Record<string, number>> = {
    "whisper-1": 0.006,
};

/** US dollars per call, for providers that bill per request. */
const CALL_RATES: Readonly<Record<string, number>> = {
    tavily: 0.008,
    firecrawl: 0.001,
};

/**
 * Estimates the dollar cost of a token-billed call.
 *
 * @param model - Provider model id
 * @param inputTokens - Tokens sent
 * @param outputTokens - Tokens received
 * @returns Estimated cost in US dollars; zero for an unpriced model
 */
export function estimateTokenCostUsd(
    model: string,
    inputTokens: number,
    outputTokens: number,
): number {
    const rate = TOKEN_RATES[model];
    if (rate === undefined) return 0;
    return (
        (Math.max(0, inputTokens) / 1_000_000) * rate.inputPerMillion +
        (Math.max(0, outputTokens) / 1_000_000) * rate.outputPerMillion
    );
}

/**
 * Estimates the dollar cost of a duration-billed call.
 *
 * @param model - Provider model id
 * @param seconds - Media duration processed
 * @returns Estimated cost in US dollars; zero for an unpriced model
 */
export function estimateDurationCostUsd(model: string, seconds: number): number {
    const perMinute = MINUTE_RATES[model];
    if (perMinute === undefined) return 0;
    return (Math.max(0, seconds) / 60) * perMinute;
}

/**
 * Estimates the dollar cost of a per-request provider call.
 *
 * @param provider - Provider key in the per-call rate table
 * @param calls - Number of calls made
 * @returns Estimated cost in US dollars; zero for an unpriced provider
 */
export function estimateCallCostUsd(provider: string, calls: number): number {
    const perCall = CALL_RATES[provider];
    if (perCall === undefined) return 0;
    return Math.max(0, calls) * perCall;
}

/**
 * Attributes spend to a provider and a feature.
 *
 * @param provider - Provider that was billed
 * @param feature - Product feature the call served
 * @param usd - Estimated dollars; non-positive amounts are ignored
 */
export function recordProviderCost(
    provider: string,
    feature: CostFeature,
    usd: number,
): void {
    if (!Number.isFinite(usd) || usd <= 0) return;
    providerCostUsd.inc({ provider, feature }, usd);
}

/**
 * Prices a token-billed call and records it in one step.
 *
 * @param input - Model, feature, and token counts for the call
 * @returns The estimated cost that was recorded
 */
export function recordTokenCost(input: {
    provider: string;
    model: string;
    feature: CostFeature;
    inputTokens: number;
    outputTokens: number;
}): number {
    const usd = estimateTokenCostUsd(
        input.model,
        input.inputTokens,
        input.outputTokens,
    );
    recordProviderCost(input.provider, input.feature, usd);
    return usd;
}
