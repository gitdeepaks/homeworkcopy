# Phase 9: Advanced Outputs and Notes

Last updated: 17 August 2026

## Scope

Phase 9 closes the remaining synthesis gaps on top of the stable notebook:

| Deliverable | Shape |
| --- | --- |
| Video-style explainer | `VIDEO_EXPLAINER` output: narrated storyboard, captions, transcript, citations, thumbnail, download |
| Presentation slides | `SLIDES` output: editable deck with per-slide evidence |
| Data table extraction | `DATA_TABLE` output: cited rows with source links |
| Audio file sources | `AUDIO` source type: transcription with timestamped citations |
| Notes | `Note` model: written by hand or saved from a chat answer or an output |
| Export | Markdown for every new output type and for notes |

Every new output type reuses the Phase 7 contracts unchanged: source snapshot,
generation options, `attemptCount` idempotency, stage/failure codes, retry,
cancel, duplicate, delete, and the same viewers' accessibility rules.

## Video-style explainer

A video explainer here is a **narrated storyboard**, not generated video. The
plan gates full generative video on a demand check; this ships the deliverable
that check needs — something a reader can actually watch, verify, and keep.

```
PENDING/QUEUED
  → SCRIPTING   grounded storyboard written from the selected sources
  → SYNTHESIS   one TTS request per scene, bounded concurrency
  → ASSEMBLY    per-scene durations measured, narration concatenated
  → storage     authenticated object upload keyed by the output id
  → READY
```

Stages, cancellation checks, duration measurement, storage keying, and
retry-from-stage are shared with Audio Overview:
`synthesizeSpeechSegments` and `storeNarrationAudio` in
`services/audio-overview.service.ts` are used by both pipelines, so a fix to one
is a fix to both.

**Frames.** Scene visuals are rendered as DOM (`StoryboardStage`), not as a
rasterized image. That keeps them readable at any text size, correct in both
themes, selectable, and available to a screen reader. The opening scene is the
output's thumbnail on its Studio card.

**Captions.** `buildWebVtt` derives a WebVTT document from the same timings the
transcript uses, so the two can never disagree, and the client publishes it as a
same-origin blob for a `<track>` element. Nothing extra is stored, so there is
exactly one media object per output to key, replace, and retire.

**Download.** The narration track is downloaded through the same signed
`GET /artifacts/:id/audio` endpoint Audio Overviews use; the storyboard and
transcript export as Markdown.

## Slides and data tables

Both attach citations **structurally** (`sourceLabels` on a slide or a row)
rather than inline, because a marker inside a bullet or a table cell reads as
noise. The allowed labels are bound into the response schema per generation, so
an invented label is rejected by the same repair loop that fixes any other
malformed response instead of being stripped afterwards. Element ids are assigned
by the server, never trusted from the model.

Data table cells are plain strings holding the wording the sources used. A value
the sources do not state is an empty string, rendered as an em dash — never
invented, never reformatted.

### Hand editing

`PUT /api/workspaces/:workspaceId/artifacts/:artifactId/content` replaces the
content of a `SLIDES` or `DATA_TABLE` output that is `READY`.

- The payload is validated against the same contract the generator satisfies, so
  an edited output is indistinguishable from a generated one to every viewer and
  exporter.
- `sourceLabels` are not editable. Wording belongs to the reader; provenance
  belongs to the generator, and a reader who could retype attribution could
  fabricate it.
- The source snapshot, labels, options, and model are untouched. Only
  `metadata.editedAt` is added, so the record of what evidence the output was
  built from survives editing.
- Editing anything else returns `409 OUTPUT_NOT_EDITABLE`, as does editing an
  output that is still generating.

## Audio file sources

```
upload → verify container signature → authenticated object storage
  → EXTRACTING (transcribe) → CHUNKING (by segment) → EMBEDDING → INDEXING → READY
```

- `verifyAudioUpload` checks the file's own bytes (ID3/MPEG sync, `RIFF…WAVE`,
  `ftyp`, `OggS`, `fLaC`, EBML) rather than trusting `Content-Type`, and resolves
  the container format the object is stored with.
- Files are stored as authenticated Cloudinary `video` assets under
  `chaibook/source-audio/`, keyed by content checksum so a retried upload
  overwrites rather than fans out. Deletion destroys them with
  `type: "authenticated"`; the default `upload` type would silently leave a
  billable object behind.
- The background job reads the file back through a **freshly minted** signed URL
  rather than one persisted at upload time, so a stored signature can never
  outlive its validity.
- Transcripts arrive as timestamped segments and flow into the existing
  transcript chunker, so an audio source's chunks carry `timestamp` metadata and
  its citations open at the right moment — the same path YouTube transcripts use.
- A retry reuses a transcript that was already paid for; only a reprocess (which
  clears metadata) transcribes again.
- `lib/stt/` mirrors `lib/tts/`: `SpeechToTextProvider` is the only thing the
  pipeline knows, and `STT_PROVIDER` chooses the adapter.

## Notes

Notes are the reader's own writing, created by hand or saved from a chat answer
or a Studio output excerpt.

**Notes do not participate in grounding.** `NOTES_PARTICIPATE_IN_GROUNDING` is
`false` and documented as a deliberate decision, not a default awaiting a
toggle: indexing a note would let a model cite the reader's own paraphrase back
to them as evidence, and would change what "grounded in your sources" means
without them asking. Notes are never chunked, embedded, or indexed. Adopting
them as a source class later needs a distinct user-authored source type, its own
processing version, and an explicit reader opt-in — not a flipped constant.

**Citations point one way.** A note cites source locations using the same
location fields the chat contract uses, so the same in-place source viewer opens
both. A client sends only `sourceId` plus the location and excerpt; the server
resolves each citation against the notebook's sources and fills in the
authoritative type and title. That single step is both the ownership check and
the guarantee that a note can never assert something false about a source.

`savedFrom` is verified the same way: a chat origin must name a conversation in
this notebook, an output origin must name an output in it.

Notes own no vectors and no stored objects, so deletion is one row with nothing
left to reconcile.

## Failure codes added

| Code | Stage | Retriable |
| --- | --- | --- |
| `VIDEO_UNAVAILABLE` | `SCRIPTING`/`SYNTHESIS` | no (configuration) |
| `STORYBOARD_NOT_GROUNDED` | `SCRIPTING` | no |

`OUTPUT_NOT_EDITABLE` is an API error (409), not a generation failure: nothing
was attempted, so nothing is persisted on the output.

## Capabilities

`GET /api/capabilities` now reports:

- `audioOverview` — speech provider plus media storage.
- `videoExplainer` — the same two dependencies; the pair moves together.
- `audioSources` — transcription provider plus media storage.

Studio and the Add source picker read this and disable the affected tool with a
plain explanation rather than offering something that could only fail later. No
tool is ever shown as a working "coming soon" card.

## Migration

`20260817090000_advanced_outputs_and_notes` adds the `note` table and the
`NoteOrigin` enum, then appends `SourceType.AUDIO` and the three new
`ArtifactType` values. Enum values are added last because a value added inside a
transaction cannot also be referenced by it. Nothing existing is renamed, and
every existing output, source, and citation reads unchanged.
