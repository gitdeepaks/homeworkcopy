# Homeworkcopy

A source-grounded study and research notebook. You add the sources you trust,
ask questions against them, and every answer comes back with citations that open
the exact page, chunk, or timestamp that supports it — without leaving the
conversation.

The repository is a Bun workspace: a Next.js client, a standalone Express API,
and a shared contracts package.

| | |
| --- | --- |
| **App** | https://web-production-11d802.up.railway.app |
| **API** | https://api-production-1cad.up.railway.app |

The API is public because two external services call it directly — Clerk posts
identity webhooks to `/api/webhooks/clerk` and Inngest invokes jobs at
`/api/inngest`. The browser never uses it: the client reaches the API over the
private network and serves everything from its own origin (§3).

---

## 1. The problem

A general-purpose chatbot will answer a question about your reading material,
but you cannot check the answer. It draws on the whole internet plus whatever it
remembers, it invents references that look plausible, and when it is right you
still have no way to find the sentence it was right about. For coursework,
literature review, or any work you have to defend, an unverifiable answer is
worth very little.

The other half of the problem is that study material does not arrive in one
format. It is a PDF, a lecture recording, a YouTube video, a documentation site,
and a page of pasted notes. Getting all of that into one place where it can be
questioned as a single body of material is normally manual work.

Homeworkcopy is built around four constraints that follow from that:

- **Only your sources answer.** Retrieval is scoped to one notebook, and further
  to the sources you have selected inside it. Nothing else enters the context.
- **Every citation is openable.** A citation carries a source id, page, chunk, or
  media timestamp, and it is validated against the database before it is
  persisted. An answer never implies a reference that cannot be opened.
- **Half-processed sources stay out.** A source that is still extracting, or that
  failed, is not retrievable and is not usable for generation. Silent partial
  grounding is worse than an obvious gap.
- **External processors are opt-in.** Learned memory and web search are separate
  vendors, both default-off per account, both enforced at the boundary where the
  call is made.

## 2. What it does

**Sources.** PDF and audio upload, website import, YouTube import, web-search
import, and pasted text or Markdown. Ingestion runs as a durable background job
with visible stages (`QUEUED → EXTRACTING → CHUNKING → EMBEDDING → INDEXING →
READY`), retries, and reprocessing. Up to 100 sources per notebook.

**Chat.** Streaming answers grounded in the selected sources, with hybrid
retrieval, follow-up query rewriting, rolling conversation summaries, inline
citations, and per-message feedback. Optional web search is available as a tool
when the account has consented to it.

**Studio.** Fourteen output types generated from the same grounded material:
summary, takeaways, flashcards, quiz, mind map, report, study guide, FAQ,
timeline, briefing, slides, data table, Audio Overview, and video explainer.
Generation is a background job with stages, cancellation, and retry.

**Notes.** Manual notes alongside generated outputs, including saving a chat
answer as an output.

**Collaboration.** Notebook members with `EDITOR` / `VIEWER` roles, email
invitations, revocable share links, ownership transfer, and an audit-backed
activity feed.

**Memory.** Manual memories you write yourself, plus optional learned memory from
your conversations — the latter behind consent.

**Privacy.** A settings page that names every processor that receives data under
your current choices, plus account export and account deletion.

## 3. Architecture

### Repository layout

```
client/              Next.js 16 App Router, React 19, Tailwind 4
server/              Express 5 API, Prisma 7, Inngest job handlers
packages/contracts/  Zod schemas + constants shared by both sides
deploy/              Migration image and the operations runbook
```

`@homeworkcopy/contracts` is the seam. Source types, citation envelopes, output
metadata versions, and every shared limit (`CHAT_MESSAGE_MAX_LENGTH`,
`SOURCE_SELECTION_MAX`, `NOTEBOOK_SOURCE_MAX`, …) are declared once as Zod
schemas and imported by both the client and the API, so a contract change breaks
the build rather than production.

### Runtime topology

```
        Browser
           │  Clerk session
           ▼
   Next.js client (3000)  ──rewrites /api/*──►  Express API (8080)
                                                   │
                        ┌──────────────────────────┼───────────────────────┐
                        ▼                          ▼                       ▼
                  PostgreSQL 17              Inngest workers         Providers
                  (Prisma 7)                 (same process,          OpenAI, Pinecone,
                                              /api/inngest)          Cloudinary, Firecrawl,
                                                                     Tavily, Mem0
```

The client never holds a provider secret. It proxies API calls through Next
rewrites so the browser sees one origin, and it forwards the Clerk bearer token.
The API is the only process that talks to PostgreSQL or to any vendor.

Background work is Inngest, served from the same Express process at
`/api/inngest`. Jobs are idempotent and versioned — a retried ingestion does not
leave duplicate chunks or orphan vectors, because chunk writes and vector upserts
are keyed by `processingVersion`.

### The API surface

| Route | Purpose |
| --- | --- |
| `/api/workspaces` | Notebook CRUD |
| `/api/workspaces/:id/sources` | Upload, import, reprocess, delete, chunk inspection |
| `/api/workspaces/:id/chat` | Streaming grounded chat, guide suggestions |
| `/api/workspaces/:id/conversations` | History, rename, feedback, save-as-output |
| `/api/workspaces/:id/artifacts` | Studio outputs, audio delivery, cancel, retry |
| `/api/workspaces/:id/notes` | Manual notes |
| `/api/workspaces/:id/sharing`, `/activity` | Members, invitations, share links, audit feed |
| `/api/memory` | Manual and learned memories |
| `/api/privacy` | Settings, disclosure, exports, deletion |
| `/api/capabilities` | Which optional Studio tools this deployment can deliver |
| `/api/webhooks/clerk` | Verified identity webhook |
| `/health/*`, `/metrics` | Probes and operational telemetry |

Every route under `/api` is rate limited, and the sensitive families
(chat, source import, generation, memory mutation, data export) carry their own
tighter buckets on top of the global one.

### Layering on the server

`routes → controllers → services → repositories → Prisma`. Validators are Zod
schemas at the controller edge; `lib/` holds the provider adapters (OpenAI,
Pinecone, Cloudinary, Firecrawl, Tavily, Mem0, TTS, STT) and cross-cutting
concerns (logging, metrics, cost accounting, the SSRF URL guard, share tokens).
Authorization is centralized in `notebook-access.service.ts`, which resolves an
actor to a capability (`notebook:read`, `notebook:write`, …) for every notebook
operation, owner or member alike.

### Data model

`User` owns `Workspace` (the notebook). A notebook holds `Source` →
`SourceChunk`, `Conversation` → `Message`, `LearningArtifact` (Studio outputs),
and `Note`. Sharing adds `NotebookMember`, `NotebookInvitation`,
`NotebookShareLink`, and `AuditEvent`. Privacy adds `UserPrivacySetting`,
`DataExport`, `DeletionReceipt`, and `ChatUsage` for daily quota accounting.
`ClerkWebhookEvent` deduplicates identity webhooks by `svix-id`.

PostgreSQL holds the text and all ownership; Pinecone holds only vectors and
retrieval metadata. The database is therefore the addressing authority — which
is why deletion walks it last (§4.5).

## 4. Flows

### 4.1 Adding a source

```
POST /api/workspaces/:id/sources/upload   (or /import/website | /import/youtube | ...)
  → authorize notebook, validate, dedupe by content checksum + idempotency key
  → persist Source (PENDING) and emit `source/created`
  → 202, client polls stage

Inngest `process-source`  (3 retries, concurrency 5 per notebook)
  → EXTRACTING  unpdf | Firecrawl | YouTube captions | STT transcription
  → CHUNKING    ~1000 chars, 100 overlap, page and timestamp anchors preserved
  → EMBEDDING   text-embedding-3-small, 1536 dims
  → INDEXING    upsert into Pinecone, namespaced per workspace
  → READY
```

Failure marks the source `FAILED` with a typed failure code rather than leaving
it stuck, and reprocessing bumps `processingVersion` so the old chunks and
vectors are replaceable rather than additive. YouTube videos without captions
fall back to downloading the audio and transcribing it, bounded by a duration
ceiling because transcription is billed by the minute.

### 4.2 Asking a question

```
POST /api/workspaces/:id/chat
  → authorize, validate message lengths, reserve daily quota
  → persist the user message
  → resolve grounding: READY sources ∩ the user's selection
  → rewrite the query if it is a follow-up
  → hybrid retrieval:  Pinecone vector search ⊕ PostgreSQL keyword search
                       fused with reciprocal rank fusion (k=60),
                       capped at 2 chunks per source, min score 0.35, top 6
  → recall Mem0 memories        [only if learned memory is consented]
  → build the system prompt from chunks + rolling summary + memories
  → streamText, with the web-search tool exposed [only if web search is consented]
  → stream to the browser
  → persist the assistant message; citations validated against real
    source and chunk ids before they are written
  → reconcile quota against real token usage
  → every 8 messages, enqueue `conversation/summarize`
  → if consented, hand the turn to Mem0 for learning
```

The two consent checks are read per request from `UserPrivacySetting` and
enforced at the point of the provider call, not in the UI.

### 4.3 Generating a Studio output

```
POST /api/workspaces/:id/artifacts { type, sourceIds }
  → authorize, check the type is available in this deployment
  → persist LearningArtifact (PENDING) and emit `artifact/generate`

Inngest `generate-artifact`  (2 retries, concurrency 5 per notebook)
  → retrieve from the selected READY sources
  → structured generation against a Zod schema from the contracts package
  → for Audio Overview / video explainer: TTS, then a signed Cloudinary upload
  → READY, with a content version and metadata version stamped on the row
```

`GET /api/capabilities` reports whether narrated outputs and audio sources are
configured, and Studio disables those tools with an explanation instead of
offering a button that would fail.

### 4.4 Sharing a notebook

An owner invites by email or mints a share link. Redeeming either requires an
account, so a notebook's members are always people the owner can see and remove.
Roles are `EDITOR` and `VIEWER`; every membership change writes an `AuditEvent`,
and those events are what the activity feed renders. Share and invite pages are
served `no-store` and `noindex` — the token in the URL is a bearer capability.

### 4.5 Deleting an account

```
POST /api/privacy/deletion  →  Inngest `delete-account` (5 retries, serialized per user)
  → Pinecone vectors
  → Cloudinary objects
  → Mem0 learned memory
  → Clerk identity
  → PostgreSQL rows
  → DeletionReceipt
```

That order is not arbitrary. Everything outside the database is addressed by an
identifier only the database holds, so PostgreSQL goes last or the remaining
stores become unreachable garbage. The receipt carries no personal data and
outlives the account, which is also what a database restore needs in order to
avoid resurrecting a deleted account.

## 5. Getting started

### Prerequisites

- Bun 1.2.20 or compatible
- PostgreSQL 17
- Separate Clerk development, staging, and production instances
- Optional, for the YouTube audio fallback: `yt-dlp`, `ffmpeg`, `ffprobe` on `PATH`

### Setup

1. Copy `client/.env.example` to `client/.env` and `server/.env.example` to `server/.env`.
2. Configure Clerk Google OAuth, `/sso-callback`, allowed origins, and production domains in each Clerk instance.
3. Run `bun install`, `bun run generate`, and `bun x --cwd server prisma migrate deploy`.
4. Start everything with `bun run dev` — this runs the client, the API, and the Inngest dev server together.

`bun run dev` is the normal path. To run pieces separately: `bun run dev:client`,
`bun run dev:server`, `bun run dev:inngest` (the last points the pinned CLI at
`http://localhost:8080/api/inngest`).

The API starts with only a subset of providers configured. Anything unset simply
makes that feature unavailable rather than broken — production is the only mode
that refuses to boot on a missing secret.

## 6. Quality gates

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run check` — all of the above, after `prisma generate`

CI performs a frozen install, Prisma generation and validation, migration
deployment and status, static checks, tests, and production builds against a
real PostgreSQL 17 service.

Tests live next to the code they cover (`*.test.ts`) and run under `bun test` in
all three packages.

## 7. Authentication

Clerk is the only accepted session authority. PostgreSQL `User.id` remains the
domain ownership key; `User.clerkUserId` links external identities. Browser and
server requests to Express use Clerk bearer tokens.

The verified webhook endpoint is `POST /api/webhooks/clerk`. Configure
`CLERK_WEBHOOK_SIGNING_SECRET` and subscribe to `user.created`, `user.updated`,
and `user.deleted`. Webhook events are deduplicated by `svix-id`. Clerk deletion
disconnects the identity but retains domain data pending the explicit retention
policy.

Run `bun run --cwd server auth:reconcile` before cutover and after first-login
migration. It exits nonzero for unlinked users or duplicate normalized emails and
reports notebook ownership counts. Do not remove legacy `Session`, `Account`, or
`Verification` tables until this report passes and the rollback window closes.
Existing Better Auth sessions are not accepted and users must sign in with Google
again.

Production policy defaults: one active Clerk session per browser profile, Google
OAuth only, Clerk bot protection enabled, and no automatic domain-data cascade on
Clerk account deletion. MFA/passkeys require a separate reviewed rollout.

## 8. Security posture

- **Boot-time environment validation.** A production container with a missing
  secret fails to start, visibly, in the deploy — rather than coming up, passing
  its health check, and returning 500s to whoever clicks first.
- **Exact-match CORS.** No wildcards, no suffix matching; a suffix match on
  `example.com` also matches `evil-example.com`. Production additionally requires
  every origin to be https.
- **`trust proxy` as a hop count, never `true`.** Believing the left-most
  `X-Forwarded-For` entry makes every address-keyed rate limit bypassable with a
  header.
- **SSRF guard** on every reader-supplied URL, disable-able only in development
  and refused outright in production.
- **A real CSP** on the client: strict script sources, `frame-ancestors 'none'`,
  and `no-store, noindex` on invite, share, and settings routes.
- **Redacting logs.** Tokens, source text, and provider payloads never reach the
  log by default.
- **Graceful shutdown** with a 15-second deadline, because a platform sends
  SIGKILL on a fixed timer regardless of what is still streaming.

## 9. Production operations

Deployment manifests live at `server/Dockerfile`, `client/Dockerfile`,
`deploy/migrate.Dockerfile`, and `docker-compose.yml`. Migrations run as their own
job before the API rolls, because an API that migrates on boot races itself once
it has two replicas.

Rehearse the stack locally with `cp deploy/.env.staging.example .env && docker
compose up --build` (add `--profile local-jobs` to run background jobs too).

The deployment linked at the top of this file runs on Railway as two services,
built from `server/Dockerfile` and `client/Dockerfile` and configured by
`railway.toml` and `client/railway.toml`. Railway cannot order one service's
rollout behind another's, and its only run-exactly-once-before-the-new-container
primitive is a pre-deploy command — which executes inside the API image. So
migrations run there as the API's pre-deploy step rather than from
`deploy/migrate.Dockerfile`, which is why `prisma` is a production dependency of
the server and the CLI ships in that image. The ordering guarantee is worth more
than keeping the CLI out; on a platform that can order a job ahead of a rollout,
use the migration image and drop `prisma` back to a dev dependency.

Probes answer three different questions and must be wired to three different
things: `/health/live` for restarts, `/health/ready` for load-balancer rotation,
and `/health/detail` for dashboards. Pointing liveness at readiness turns a
database blip into a full restart of every instance. `/health/detail` and
`/metrics` require `X-Ops-Token` and do not exist without `OPS_TOKEN` set — they
404 rather than 401, because an endpoint that returns 401 still confirms it
exists.

`deploy/RUNBOOK.md` carries deploy order, rollback, backup and restore, the alert
table, the SLOs, and the drills to rehearse before launch.

## 10. Privacy and data

Learned memory and web search are optional processors, both **default off** per
account, enforced at the provider boundary and read on every request. Settings
live at `/settings/privacy`, which also publishes who receives data under the
reader's current choices, the retention policy, account export, and account
deletion.

Retention runs nightly as its own job (`enforce-retention`, 03:20 UTC): retention
windows are measured in days, so a purge that is a few hours late is not late,
and a nightly run is far easier to reason about when something is missing than a
constant trickle.

Account deletion is described in §4.5. See
`server/docs/phase11_production_hardening.md`.

## 11. Environment

**Client**

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk |
| `API_URL` | Express origin the rewrites proxy to |
| `NEXT_PUBLIC_APP_URL` | Public app origin |

**Server — required**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 17 |
| `CLIENT_URL` | Comma-separated allowed browser origins, matched exactly |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` | Auth and webhooks |
| `OPENAI_API_KEY` | Chat and embeddings |
| `PINECONE_API_KEY`, `PINECONE_INDEX` | Vector index (auto-created, 1536 dims, cosine) |
| `CLOUDINARY_CLOUD_NAME` | Object storage |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Background jobs in production |

**Server — operational**

`PORT`, `NODE_ENV`, `LOG_LEVEL`, `TRUST_PROXY_HOPS`, `OPS_TOKEN`,
`CHAT_DAILY_REQUEST_LIMIT` (100), `CHAT_DAILY_TOKEN_LIMIT` (500,000),
`ALLOW_PRIVATE_NETWORK_FETCH` (development only), `INNGEST_DEV=1` (local only).

**Server — optional features**

| Variable | Enables |
| --- | --- |
| `MEM0_API_KEY` | Learned memory (still per-account consent gated) |
| `TAVILY_API_KEY` | Web search (still per-account consent gated) |
| `FIRECRAWL_API_KEY` | Website imports |
| `TTS_PROVIDER` (`openai`), `TTS_MODEL` + `CLOUDINARY_API_KEY`/`_SECRET` | Audio Overview and video explainer |
| `STT_PROVIDER` (`openai`), `STT_MODEL` + the same Cloudinary credentials | Audio source uploads; the model must return segment timestamps |
| `YOUTUBE_AUDIO_FALLBACK`, `YOUTUBE_AUDIO_MAX_DURATION_MINUTES`, `YTDLP_*`, `FFMPEG_PATH`, `FFPROBE_PATH` | Transcribing caption-less YouTube videos |

`GET /api/capabilities` reports which halves are configured; the UI disables the
affected tools with an explanation rather than failing at submit time.

Secrets, webhook signing keys, and Clerk secret keys are server-only. Keep test
and production keys strictly separated.

## 12. Further reading

| Document | Covers |
| --- | --- |
| `server/docs/pro_plan.md` | Product goal, gap audit, phased delivery plan, engineering rules |
| `server/docs/phase3_retrieval_evaluation.md` | Retrieval design and evaluation |
| `server/docs/phase8_audio_overview.md` | Audio Overview |
| `server/docs/phase9_advanced_outputs_and_notes.md` | Advanced outputs and notes |
| `server/docs/phase10_collaboration_and_sharing.md` | Members, invitations, share links, activity |
| `server/docs/phase11_production_hardening.md` | Security, privacy, retention, deletion, operations |
| `deploy/RUNBOOK.md` | Deploy order, rollback, backup and restore, alerts, SLOs |
