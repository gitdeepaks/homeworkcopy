# Phase 8: Audio Overview

Last updated: 16 August 2026

## Scope

`AUDIO_OVERVIEW` is a first-class Studio output: a grounded spoken script,
synthesized audio in durable storage, and a synchronized transcript that carries
the same citations the script was written from. Audio is never the only way to
consume the output.

## Pipeline

```
PENDING/QUEUED
  → SCRIPTING   grounded script written from the selected sources
  → SYNTHESIS   one TTS request per segment, bounded concurrency
  → ASSEMBLY    per-segment durations measured, segments concatenated
  → storage     authenticated object upload keyed by the output id
  → READY
```

`LearningArtifact.stage` (`ArtifactStage`) records the current position. Text
outputs use `QUEUED → GENERATING → READY|FAILED`; only audio uses the three
middle stages. Studio cards and the detail view render the stage label while an
output is `PENDING` or `PROCESSING`.

## Grounding

The script schema is built per generation with the notebook's source labels
bound into it, so an invented `[S9]` marker is rejected by the same repair loop
that fixes any other malformed model response. A script where no segment cites a
source fails with `SCRIPT_NOT_GROUNDED` rather than being synthesized.

Citations are structural (`segment.sourceLabels`), not inline: a listener cannot
hear a marker, so the transcript renders them as links beside each segment.

## Idempotency, cancellation, and retry

- Every write is guarded by `attemptCount`. Cancelling or regenerating bumps the
  counter, which invalidates any worker still running for the previous attempt.
- Synthesis re-checks `isArtifactAttemptCurrent` between batches, so a
  cancellation stops before paying the provider for the remaining segments.
- The script is persisted as soon as it is written, together with a
  `scriptFingerprint` over the source ids, their processing versions, and the
  generation options. A retry with an unchanged fingerprint reuses that script
  and re-enters at synthesis. Per-segment audio is not cached: a retry re-runs
  synthesis for the whole script.
- Media is stored under the output id with `overwrite: true`, so regeneration
  replaces the previous file instead of leaking a new one.

## Storage and signed access

Audio is uploaded to Cloudinary as an `authenticated` `video` asset in
`chaibook/audio/`, which requires `CLOUDINARY_API_KEY` and
`CLOUDINARY_API_SECRET` (the unsigned preset used for PDFs is not enough).

`GET /api/workspaces/:workspaceId/artifacts/:artifactId/audio` performs the
ownership check and returns:

- `playbackUrl` — a signed delivery URL, which supports the range requests an
  `<audio>` element issues while scrubbing.
- `downloadUrl` — a provider-expiring private download URL.
- `expiresAt` — the refresh deadline the client polls against.

Known limitation: delivery-URL expiry needs Cloudinary auth tokens, which are a
paid feature. Playback URLs are therefore signed but not themselves
time-limited; the client still refreshes them on `expiresAt`, and the download
URL honours the expiry. Moving to token-based delivery is a configuration change
inside `lib/audio-storage.ts` only.

Deleting an output enqueues `artifact/media-cleanup` before the row is removed,
so a failed enqueue leaves the output intact and retryable. The job is
idempotent: destroying an object that is already gone is a no-op.

## Provider interface

`lib/tts/types.ts` defines `TextToSpeechProvider`; `lib/tts/index.ts` resolves
one from `TTS_PROVIDER`. The rest of the system knows only provider-neutral
concepts — a `voiceProfile` (`neutral`/`warm`/`bright`) and a `speaker`
(`host`/`guest`) — which each adapter maps onto its own voice catalogue. Adding
a vendor means adding a factory and nothing else.

Durations come from `lib/audio/mp3.ts`, which sums MPEG frame headers. That
keeps the deployment free of ffmpeg and works for variable-bitrate output.

## Failure codes

| Code | Stage | Retriable |
| --- | --- | --- |
| `AUDIO_UNAVAILABLE` | `SCRIPTING`/`SYNTHESIS` | no (configuration) |
| `SCRIPT_NOT_GROUNDED` | `SCRIPTING` | no |
| `INVALID_MODEL_OUTPUT` | `SCRIPTING` | no |
| `SYNTHESIS_FAILED` | `SYNTHESIS` | yes |
| `AUDIO_ASSEMBLY_FAILED` | `ASSEMBLY` | yes |
| `AUDIO_STORAGE_FAILED` | `STORAGE` | yes |

## Player

Custom controls over a native `<audio>` element: play/pause, seek, ±15 s skip,
speed, mute, duration, and download. Media Session metadata and action handlers
are registered so lock-screen and headset controls work while the tab is in the
background. Transport controls are 44×44 CSS pixels; the transcript highlights
the current segment, and clicking a timecode seeks to it.
