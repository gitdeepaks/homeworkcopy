# Phase 3 Retrieval Evaluation

Date: 14 August 2026

## Scope

The initial evaluation set is stored in `server/evals/phase3-grounding-cases.json`. It covers selected-source inclusion and exclusion, follow-up rewriting, exact keyword retrieval, cross-notebook rejection, non-ready rejection, and evidence-free abstention.

## Deterministic Baseline

| Check | Cases | Result |
| --- | ---: | --- |
| Grounding request validation | 3 | Pass |
| Ownership/readiness set validation | 4 | Pass |
| Hybrid merge, reranking, deduplication, and source cap | 2 | Pass |
| Follow-up query rewriting | 1 | Pass |
| Notebook-only no-evidence policy | 1 | Pass |
| Client selection reconciliation | 3 | Pass |

The baseline is enforced by Bun tests in the contracts, server retrieval/service, and client source-selection modules.

## Release Thresholds

- Unauthorized or non-ready source acceptance: 0%.
- Selected-source retrieval precision: at least 95% on the curated set.
- Citation target validity: 100% for emitted citations.
- Notebook-only abstention when evidence is absent: 100%.
- Per-source result share: no more than two of the six final chunks.

Provider-backed answer groundedness and citation precision require a seeded staging notebook and live model execution. Those metrics must be recorded before production release because deterministic unit tests cannot grade generated prose honestly.
