# Homeworkcopy: Product Gap Audit and Phased Delivery Plan

Last updated: 12 August 2026

## 1. Product Goal

Homeworkcopy should be a production-grade, source-grounded study and research notebook inspired by the quality bar and interaction model of Gemini Notebook. Its visual identity should feel like working inside a real ruled notebook copy, with handwritten notes on physical paper rather than a conventional SaaS dashboard. It should not be a pixel-for-pixel brand copy. The product should combine four activities in one continuous notebook:

1. Add and manage trusted sources.
2. Chat against selected sources with verifiable citations.
3. Open the exact cited source location without losing the conversation.
4. Create reusable study outputs in a Studio.

The product name shown to users, in generated content, and in operational metadata will be **Homeworkcopy**. Internal `Workspace` and `LearningArtifact` names may remain during early implementation to avoid a risky all-at-once database/API rename, but customer-facing language must consistently use **Notebook** and **Output**.

## 2. Definition of the Target Standard

The target experience is based on the current public Gemini Notebook value proposition and the expected standard for a reliable learning product:

- Multiple source formats and dependable background ingestion.
- Answers grounded in user-selected sources.
- Inline citations that reveal exact supporting quotes.
- A persistent Sources, Chat, and Studio workflow.
- A tactile ruled-paper interface that evokes handwritten study notes without sacrificing readability or usability.
- Audio-style overviews and rich study outputs.
- Strong notebook dashboard, onboarding, mobile behavior, accessibility, and recovery states.
- Production security, observability, testing, deployment, and data lifecycle controls.

“Same standard” means matching these product capabilities and quality attributes with Homeworkcopy's own notebook-copy visual identity. It does not mean copying Google's trademarks, copy, icons, or proprietary visual assets.

## 3. Current Architecture

### Client

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4.
- TanStack Query for server state and AI SDK `useChat` for streaming.
- Zustand for local chat preferences.
- Existing feature areas: auth, workspaces, sources, chat, learn, and memory.
- Current notebook capabilities are split across separate routes for Chat, Sources, Learn, and Settings.

### Server

- Express 5, TypeScript, Prisma 7, PostgreSQL.
- Better Auth with Google OAuth is the current implementation; the target authentication platform is Clerk.
- OpenAI chat and embeddings, Pinecone retrieval, Inngest background jobs.
- Cloudinary PDF storage, Firecrawl website extraction, YouTube transcripts.
- Tavily web search and Mem0 user memory.

### Existing working foundation

- User-owned workspace/notebook CRUD.
- PDF, website, YouTube, text, and Markdown ingestion.
- Durable source processing states and reprocessing.
- Chunk persistence, embeddings, and Pinecone indexing.
- Streaming RAG chat, conversation history, export, and internal citations.
- Summary, takeaways, flashcards, quiz, mind map, and report outputs.
- Output generation jobs and status polling.
- Manual and learned memory support.

The project is therefore not a blank prototype. The correct strategy is to stabilize and reshape the existing foundation, not rewrite it.

## 4. Gap Summary

| Area | Current state | Gap to target | Priority |
| --- | --- | --- | --- |
| Product shell | Separate routed Chat, Sources, and Learn pages | Persistent desktop Sources/Chat/Studio notebook and mobile tabs | P0 |
| Visual identity | Conventional rounded-card SaaS interface | Real ruled-notebook paper, handwritten-note character, and tactile stationery details | P0 |
| Grounding | Retrieval searches all notebook sources | Per-notebook selected sources must control chat and Studio | P0 |
| Citations | Citation links navigate away; web citations fail after reload | In-place exact-location viewer and normalized persisted citations | P0 |
| Build readiness | Clean server build misses Prisma generation; client lint fails | Reproducible build and green quality gates | P0 |
| Authentication | Better Auth sessions and Google OAuth persisted locally | Migrate to Clerk without orphaning existing users or notebooks | P0 |
| Security | Mem0 update/delete do not verify ownership | Enforce authenticated ownership before mutation | P0 |
| Source UX | Form-heavy single-source dialog; generic viewer | Batch queue, visible stages, format-aware viewer | P1 |
| Chat UX | Basic streaming chat | Source-aware overview, suggestions, stop/retry/copy/feedback | P1 |
| Studio | Separate Learn route; six basic output types | Embedded Studio, selected-source generation, richer outputs | P1 |
| Media | No audio/video output contract | Audio Overview first; video-style explainer after validation | P2 |
| Collaboration | Single-owner notebooks only | Sharing, roles, comments/notes, activity | P2 |
| Platform | No tests, CI, deployment docs, rate limits, telemetry | Production engineering baseline | P0/P1 |
| Data/privacy | External vendors are wired but controls are limited | Consent, retention, deletion, export, provider disclosure | P1 |

## 5. Non-Negotiable Engineering Rules

Every phase must follow these rules:

1. No UI-only feature is complete. It must include API contracts, authorization, persistence, loading/error/retry states, analytics, and tests where applicable.
2. No API is complete without request validation, ownership checks, stable errors, idempotency where relevant, and integration tests.
3. Source-grounded answers must never imply a citation that cannot be opened and verified.
4. Pending or failed sources must not silently enter retrieval or output generation.
5. Background jobs must be retryable and idempotent. A retry must not leave duplicate chunks, vectors, or media.
6. Desktop and mobile behavior must be implemented in the same phase, not postponed as polish.
7. Accessibility is an acceptance criterion: keyboard access, visible focus, semantic controls, live status, touch targets, and reduced motion.
8. Existing production identifiers such as Pinecone index names, Cloudinary folders, local-storage keys, and Inngest IDs must not be blindly renamed. Use explicit migration or compatibility decisions.
9. Secrets must never be exposed to the client or committed. Logs must redact tokens, source text, and provider payloads by default.
10. Each phase can ship only after its exit gate passes.
11. The ruled-paper and handwritten visual language must remain functional: decorative treatments cannot reduce contrast, text legibility, responsive layout, selection clarity, or assistive-technology support.

## 6. Delivery Phases

## Phase 0: Stabilize, Secure, and Establish Quality Gates

**Objective:** Make the existing application safe to extend and reproducible on a clean machine.

### Scope

- Fix the server build by running `prisma generate` before TypeScript compilation and verify the generated-client strategy.
- Resolve the Inngest TypeScript error and all current client lint errors.
- Fix persisted web citation parsing so internal and web citations survive conversation reload.
- Enforce ownership on Mem0 update/delete. Fetch/verify the memory's `user_id` before mutation, or use a provider operation that scopes by user.
- Define a canonical citation schema shared conceptually across server/client: kind, display label, source ID or URL, title, excerpt, page/chunk/timestamp, and provenance.
- Complete environment documentation for `MEM0_API_KEY`, `TAVILY_API_KEY`, `API_URL`, `NEXT_PUBLIC_APP_URL`, and production Inngest configuration.
- Add server/client `typecheck`, `lint`, `test`, and `build` scripts with a root-level developer workflow.
- Add CI for dependency install, Prisma generation, migrations check, lint, typecheck, unit/integration tests, and builds.
- Add baseline structured logging, request IDs, centralized error codes, and external-provider timeout handling.
- Add rate limits for auth-sensitive, source-import, chat, web-search, and generation endpoints.

### Better Auth to Clerk migration

**Target architecture**

- Use the current `@clerk/nextjs` SDK in the Next.js client and the current Clerk Express/backend SDK for the standalone Express API. Pin compatible current versions during implementation rather than relying on floating major versions.
- Make Clerk the authority for authentication, sessions, Google OAuth, account security, and future MFA/passkeys. PostgreSQL remains the authority for Homeworkcopy domain ownership and permissions.
- Preserve the existing local `User.id` primary key because notebooks and other domain records already reference it. Add a unique nullable `clerkUserId` during migration, link each Clerk identity to the existing local user, and make it required only after reconciliation succeeds.
- Resolve Clerk's verified session to the local user at the API boundary, then continue passing the local user ID through services/repositories. Do not replace all domain foreign keys with Clerk IDs.
- Use Clerk's protected-route middleware in Next.js `proxy.ts`, `ClerkProvider` in the root layout, server `auth()` for Server Components, and Clerk client hooks/components only in Client Components.
- Authenticate browser-to-Express requests with a Clerk session token/cookie supported by the chosen topology. The Express server must verify the token with Clerk middleware/backend verification and must never trust a client-provided user ID.
- Keep authorization in Homeworkcopy services. Clerk authentication does not replace notebook/source/output ownership checks.

**Migration sequence**

1. Inventory Better Auth users, Google account links, active sessions, and every client/server auth helper before changing behavior.
2. Create separate Clerk development, staging, and production instances. Configure Google OAuth, allowed origins, redirect URLs, authorized parties, and production domains for each environment.
3. Add `clerkUserId` to the local `User` model and retain the existing local ID, email, name, image, and timestamps.
4. Import or pre-create existing users in Clerk where supported, preserving the legacy local user ID in Clerk `external_id` or private metadata for reconciliation. Match only on normalized, verified email and record ambiguous/duplicate accounts for manual resolution.
5. Because the current app is Google-only, do not migrate password hashes. Existing Better Auth sessions will terminate at cutover; communicate that users must sign in with Google again.
6. On the first authenticated Clerk request, synchronously resolve/link the local user so onboarding does not depend on eventual webhook delivery. Reject automatic linking if verified identity checks are not satisfied.
7. Add a verified, idempotent Clerk webhook endpoint for `user.created`, `user.updated`, and `user.deleted`. Deduplicate using the Svix event ID, store processing status, and make deletion follow Homeworkcopy's explicit retention/deletion policy rather than blindly cascading all user data.
8. Ensure the Express webhook route receives the raw request body required by Clerk verification and is mounted before global JSON parsing. Never expose it without signature verification.
9. Replace login, sign-out, session hooks, protected page helpers, and Next.js proxy logic with Clerk equivalents. Theme Clerk surfaces to match Homeworkcopy's ruled-paper design, or retain a custom UI only if every Clerk flow remains fully supported.
10. Replace Express Better Auth routes and `requireAuth` session lookup with Clerk verification while preserving the middleware contract expected by existing controllers.
11. Run a staging reconciliation report: every legacy user has at most one Clerk identity, every notebook still resolves to its owner, and no cross-user access is possible.
12. Perform a controlled cutover, monitor sign-in/link failures, and retain a time-boxed rollback path. Do not run two session authorities indefinitely.
13. After the rollback window and reconciliation pass, remove Better Auth packages, routes, configuration, cookies, and the local `Session`, `Account`, and `Verification` tables through a reviewed migration.

**Configuration and operations**

- Document `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, and any JWT/public-key or authorized-party settings required by the final deployment topology.
- Keep test and production Clerk keys strictly separated. Secret and webhook signing keys are server-only.
- Add Clerk health/configuration checks to deployment verification without logging secrets or session tokens.
- Decide and document session lifetime, multi-session behavior, account deletion, OAuth provider policy, bot protection, and MFA/passkey rollout.
- Use Clerk Organizations only if Phase 10's collaboration model intentionally adopts them. Do not equate a personal Homeworkcopy notebook with a Clerk Organization by default.

### Minimum tests

- Workspace ownership on every nested resource.
- Clerk token verification, unauthenticated `401`, authenticated-but-forbidden `403`, and local-user resolution.
- Legacy-user reconciliation, first-login linking, duplicate-email rejection, and notebook ownership preservation.
- Clerk webhook signature rejection, idempotent replay, user update, and deletion-policy behavior.
- Memory mutation ownership.
- Citation serialize/deserialize for source and web citations.
- Source processing retry does not duplicate chunks/vectors.
- Stream completion persists one assistant response and citations.
- Clean client/server builds from a fresh checkout.

### Exit gate

- CI is green from a clean checkout.
- Clerk is the only active session authority after cutover, and Better Auth sessions/routes are no longer accepted.
- Every existing user/notebook ownership relation passes the migration reconciliation report.
- No known cross-user mutation path remains.
- Existing source upload, processing, chat, citations, and all six current outputs pass a manual smoke test.
- Environment setup and migration commands are documented and repeatable.

## Phase 1: Homeworkcopy Brand and Notebook Design System

**Objective:** Establish a distinct Homeworkcopy identity and consistent product language before restructuring major screens.

### Product and UI work

- Replace user-facing “Chaibook” with “Homeworkcopy” in metadata, landing, login, dashboard, memory, health copy, and AI system prompts.
- Standardize customer vocabulary: Notebook, Sources, Chat, Studio, Output. Keep Workspace/Artifact internal until a later migration is justified.
- Adopt a physical ruled-notebook visual direction rather than a generic productivity dashboard.
- Use a warm off-white paper canvas with subtle fibers/noise, thin blue horizontal ruling, and a red or muted coral vertical margin line. The texture must be CSS/SVG-based, lightweight, non-distracting, and sharp on high-density screens.
- Let the central Chat/Notes surface feel like the open writing page. Sources and Studio should feel like attached index tabs, clipped inserts, sticky notes, or page-side tools while retaining clear information hierarchy.
- Introduce restrained physical details such as page edges, binding/spine cues, punched-hole or stitched-divider references, paper shadows, tape/highlighter accents, underlines, check marks, and hand-drawn separators. These should support hierarchy rather than become decorative clutter.
- Use a carefully selected handwriting-style display font for notebook titles, short headings, generated key takeaways, and small annotation moments. Use a highly readable editorial sans for chat answers, source content, forms, controls, and long passages. Never render long body content entirely in a handwriting font.
- Make user prompts visually resemble handwritten ink while keeping assistant answers readable and structured. Use subtle variation in underline/highlight treatment, not random rotation or distorted text that harms scanning.
- Replace generic floating cards where possible with paper sheets, margin notes, page tabs, clipped source rows, and notebook-native controls. Reserve pills for status, filters, and compact toggles.
- Give citations the feel of numbered margin annotations or footnotes. Selection should resemble a translucent highlighter mark, while still using standard interactive focus and hover states.
- Give Studio outputs distinct stationery metaphors where useful: flashcards as index cards, quiz as a worksheet, mind map as a sketch page, report as a stapled sheet, and audio as an attached player strip. Keep the interaction model consistent even when the visual metaphor changes.
- Preserve natural imperfections only at a subtle level. Do not use excessive wobble, random rotations, fake stains, torn edges on every element, or animations that make the interface feel unstable.
- Create tokens for panel surfaces, citation highlights, source status, focus rings, and media controls.
- Consolidate theme, memory, sign out, and account controls into an avatar menu.
- Add a skip link, one valid main landmark, visible focus treatment, and reduced-motion support.

### Ruled-paper design specification

- Define reusable design tokens for paper, ink, ruling, margin, graphite, highlighter, sticky-note colors, page shadow, and dark-mode equivalents.
- Align the ruled-line spacing with the body-text line height so text appears naturally written on the lines. The pattern must not drift during zoom, font scaling, or responsive resizing.
- Keep ruled lines behind content and below the minimum contrast needed to compete with text. Form controls and dense data areas may use clean paper blocks when ruling would hurt comprehension.
- Use a consistent page rhythm based on the ruling interval for vertical spacing, message gaps, list rows, and section breaks.
- Notebook titles may use an editable handwritten treatment; control labels and navigation must remain immediately legible.
- Loading states should feel native to the metaphor, such as a pencil-line shimmer or progressive ink stroke, but must have a reduced-motion fallback.
- Empty states may use a lightly sketched illustration or starter writing prompt on the page, avoiding generic feature-card grids.
- Success, warning, and error states must retain standard semantic color and icon support; stationery styling must not be the only signal.

### Responsive and theme behavior

- Desktop may resemble an open notebook or bound writing surface, but panel resizing must not break the ruling or clip the margin line.
- Mobile should feel like a single notebook page with Sources, Chat, and Studio represented as page tabs. Do not shrink a desktop open-book composition onto a phone.
- Respect safe areas, text zoom, browser zoom, and dynamic viewport height. The composer must remain usable above the keyboard.
- Provide a dark theme inspired by dark paper/chalkboard or deep navy notebook stock, with subdued ruling and accessible light ink. Do not simply invert the paper texture.
- Print and export views must remove interactive chrome while preserving a clean notebook-page presentation where appropriate.

### Visual accessibility and performance

- Handwriting fonts are decorative enhancements, not required for understanding. Provide robust fallbacks and ensure content remains readable while fonts load.
- Meet WCAG 2.2 AA contrast for text, controls, citations, and focus indicators independently of paper lines/textures.
- Do not communicate source state, selected state, citation state, or errors through color/highlighter marks alone.
- Keep touch targets at least 44 by 44 CSS pixels even when controls visually resemble small notebook marks.
- Disable paper noise, complex shadows, and non-essential motion under reduced-motion/high-contrast or performance-constrained conditions where appropriate.
- Establish a page-background performance budget: avoid large raster textures, repeated layout-triggering effects, and expensive filters over scrolling chat content.

### Safe naming migration

- Keep old Pinecone indexes/namespaces and Cloudinary folders readable unless a data migration is implemented.
- Version or migrate the old local-storage preferences key so user settings are not silently lost.
- Coordinate any Inngest app ID change with the deployed environment; do not create two competing job consumers.

### Exit gate

- No user-facing Chaibook/workspace/artifact copy remains in active screens or generated prompts.
- Design tokens and responsive typography are used by dashboard and notebook shell.
- Dashboard and notebook screens unmistakably read as Homeworkcopy's ruled-paper environment rather than a themed generic SaaS UI.
- Ruled lines align with text rhythm at supported breakpoints and 100%, 125%, and 200% browser zoom without reducing readability.
- Handwriting typography is limited to approved display/annotation roles; long-form content and controls remain easy to scan.
- Light mode, dark mode, reduced motion, high contrast, and mobile all retain the notebook identity without losing semantic states.
- Brand changes do not orphan vectors, PDFs, preferences, or jobs.
- Accessibility smoke audit passes for login, dashboard, and shell navigation.

## Phase 2: Integrated Notebook Shell

**Objective:** Replace route-switching with one continuous notebook experience.

### Desktop information architecture

- Create `NotebookShell` with a compact notebook header and three resizable panels:
  - Sources: 240-320 px.
  - Chat: flexible, minimum approximately 480 px.
  - Studio: 280-360 px.
- Remove the site-level sidebar from inside notebooks. Retain a back-to-notebooks control in the header.
- Keep independent panel scroll areas and preserve widths/collapse state.
- Move Add source into Sources, model/grounding controls into Chat, and output creation into Studio.
- Treat Chat as the primary ruled writing page, with Sources and Studio expressed as attached notebook sections rather than three unrelated application cards.
- Preserve existing routes as direct-link compatibility, but make the integrated shell the primary interaction.

### Mobile and tablet

- Use a single active surface with persistent bottom tabs: Sources, Chat, Studio.
- Style mobile tabs as accessible notebook page tabs while preserving conventional labels, selected state, and touch behavior.
- Preserve chat scroll, draft, selected sources, active conversation, and in-progress outputs while switching tabs.
- Open source/citation details as a full-height sheet or pushed viewer with “Back to chat.”
- Collapse account, model, conversation history, export, and settings into accessible menus.

### Notebook UI state

- Define a notebook-level state store for panel widths, mobile active tab, selected source IDs, active citation/source, source viewer location, and composer draft.
- Separate server state from ephemeral UI state. TanStack Query owns fetched entities; the notebook store owns view state.
- Persist only safe preferences. Do not persist source content or conversation text in local storage.

### Exit gate

- A user can add/view sources, chat, and generate/open an existing output without leaving the notebook shell.
- Refresh and mobile tab changes preserve expected state.
- There is one main landmark and all panels are keyboard reachable.
- Layout works at small mobile, tablet, laptop, and wide desktop breakpoints.

## Phase 3: Source Selection and End-to-End Grounding

**Objective:** Make the user's selected sources the single source of truth for Chat and Studio.

### Data and API contract

- Add selected-source state with `all-ready` and `custom` modes.
- Send `sourceIds` and an explicit grounding mode with every chat request.
- Extend `chatBodySchema` to validate source IDs, source count limits, and mutually valid grounding options.
- Verify every requested source belongs to the authenticated user's notebook and is `READY`.
- Filter Pinecone retrieval by selected source IDs. Do not rely only on client filtering.
- Persist conversation grounding configuration or a message-level source snapshot so old answers remain explainable after selection changes.
- Reuse the same selected IDs as defaults for Studio output generation.

### Product behavior

- Add source checkboxes, Select all/Clear, selected count, search, and compact processing/failure status.
- Pending/failed sources remain visible but cannot be selected for grounding.
- Show “N sources selected” near the composer and Studio creation controls.
- Clearly separate modes: Notebook sources only, Notebook + web, and optional general knowledge.
- Default to notebook-only for trust. Never silently fall back to general knowledge.
- If selected sources are deleted or become unavailable, show a recoverable warning and update selection explicitly.

### Retrieval quality

- Add hybrid retrieval: vector similarity plus keyword/full-text retrieval, followed by reranking.
- Add query rewriting for follow-up questions using conversation context.
- Deduplicate overlapping chunks and cap per-source dominance.
- Track retrieval diagnostics: selected count, candidates, scores, latency, cited chunks, and no-context rate without logging private source text.
- Create a small evaluation set for answer grounding, citation correctness, and refusal when evidence is absent.

### Exit gate

- Selecting/deselecting a source demonstrably changes retrieval and output generation.
- Unauthorized/non-ready source IDs are rejected server-side.
- Every grounded claim exposes at least one valid citation, or the answer states that the sources do not support it.
- Grounding behavior is covered by integration tests and an initial retrieval evaluation report.

## Phase 4: In-Place Citation and Source Viewer

**Objective:** Let users verify every answer without losing their conversation.

### Citation contract

- Normalize internal and web citation labels, preserving labels such as `1` and `W1` end to end.
- Persist source ID, chunk ID/index, page, excerpt, URL, and optional timestamp where available.
- Validate citation targets when an assistant response is saved.
- Gracefully mark citations as unavailable if a source is later deleted, rather than breaking message rendering.

### Viewer implementation

- Wire the existing source chunks API into client query hooks.
- Citation click opens an in-place viewer and jumps to the exact chunk/page/timestamp with highlighted evidence.
- Add previous/next citation navigation, source title/type, location, nearby context, and Open original.
- PDF: embedded viewer, page navigation, cited-page jump, fallback download.
- Website: cleaned article view plus original URL.
- YouTube: transcript with timestamps and optional player jump where transcript metadata supports it.
- Text/Markdown: searchable document rendering with excerpt highlighting.
- Desktop hover may show a preview; click always opens the viewer. Mobile tap opens a citation sheet with an explicit full-view action.

### Metadata improvements

- Replace unstructured source metadata usage with validated, type-specific metadata contracts.
- Backfill or safely handle old records that lack page/timestamp metadata.

### Exit gate

- Every current source type opens successfully from a citation.
- Exact supporting text is highlighted where metadata exists.
- Chat scroll, draft, and conversation state are unchanged after opening/closing a citation.
- Keyboard, screen-reader, and touch interactions are verified.

## Phase 5: Source Ingestion 2.0

**Objective:** Make source setup fast, observable, recoverable, and extensible.

### Add-source experience

- Replace the five-tab form with a source picker: drag/drop upload, Upload files, Website, YouTube, and Paste text.
- Support multiple files and an add-more workflow.
- Keep users in the notebook after submission and auto-select successfully queued sources.
- Add client-side URL, title, content, MIME, and file-size validation matching server rules.
- Show a per-item queue with stages: Uploading, Extracting, Chunking, Embedding, Indexing, Ready/Failed.
- Surface safe failure reasons and direct retry/cancel/remove actions.

### Backend reliability

- Add idempotency keys or deterministic job protection for uploads/imports and retries.
- Use a processing version on sources/chunks/vectors so future chunking or embedding changes can trigger controlled reindexing.
- Make PostgreSQL and Pinecone cleanup observable and retryable when a source is deleted.
- Add checksum/content deduplication and warn before importing the same source twice.
- Add limits for notebook source count, upload size, extracted text size, crawl length, transcript size, and concurrent jobs.
- Add malware/file safety controls appropriate to the deployment environment.
- Store enough import metadata to reprocess sources without relying on temporary client data.

### Format roadmap

- P1: current PDF, website, YouTube, text, and Markdown at production quality.
- P2: audio files with transcription and timestamped segments.
- P2: DOCX/PPTX and cloud documents only after provider auth and permission models are designed.
- P3: scanned PDFs/images with OCR and layout-aware extraction.

### Exit gate

- Batch imports can partially succeed and expose per-item failures.
- Retrying a failed source creates no duplicate chunks or vectors.
- Deletion removes database records, vectors, and owned binary objects through a recoverable workflow.
- Processing behavior has unit/integration tests and operational metrics.

## Phase 6: Grounded Chat 2.0

**Objective:** Turn the basic stream into a complete notebook research interaction.

### Empty and ready states

- No sources: focus the user on adding sources.
- Processing: explain that grounded chat becomes available as sources finish.
- Ready: show a cached notebook overview and 3-4 source-grounded suggested questions.
- Partial failures: allow chat with ready selected sources and display a warning.
- No selected sources: disable send with a clear source-selection action.

### Conversation controls

- Move conversation history into a compact drawer/menu.
- Add rename, new conversation, delete confirmation, and reliable conversation switching.
- Explicitly decide whether New chat creates immediately or on first send; remove the currently unused creation path.
- Add stop generation, retry/regenerate, copy, edit/resubmit, feedback, and Save as note/output.
- Preserve drafts and allow a clear recovery path after stream/network failures.
- Provide separate visual treatment for notebook citations and web citations.

### Server behavior

- Handle client disconnect/cancellation and avoid persisting partial duplicate assistant messages.
- Define retry semantics so a regenerated answer is traceable without corrupting history.
- Generate conversation titles after the first exchange.
- Bound and test rolling summaries; ensure summarization failures never block chat.
- Add per-user quotas/token budgets and expose actionable limit errors.
- Add prompt-injection defenses: source text is untrusted data, tool calls are allowlisted, and source instructions cannot override system policy.

### Exit gate

- Stop, retry, reconnect, refresh, conversation switch, and error recovery all preserve consistent history.
- Suggested questions are derived from ready selected sources.
- Notebook-only answers refuse unsupported claims instead of silently using model knowledge.
- Chat E2E tests cover success, no evidence, web search, cancellation, and provider failure.

## Phase 7: Studio and Core Study Outputs

**Objective:** Turn the separate Learn area into a persistent, source-aware Studio.

### Studio structure

- Rename customer-facing Learn to Studio and artifacts to outputs.
- Embed creation tools and saved outputs in the right panel.
- Group outputs into Featured media, Study, Writing, and Saved outputs.
- Show generating, ready, and failed cards immediately with source count, useful metadata, retry, rename, export, duplicate/regenerate, and confirmed delete.
- Keep full-screen viewers as direct-link drill-down routes.

### Output model

- Continue supporting Summary, Takeaways, Flashcards, Quiz, Mind map, and Report.
- Add product-level mappings for Study Guide, FAQ, Timeline, and Briefing Document.
- Use selected notebook sources by default, with a Change sources control.
- Persist generation options, source snapshot/version, model/version, locale, failure reason, and output metrics.
- Validate generated structured output and retry/repair malformed model responses before marking a job failed.

### Viewer quality

- Flashcards: keyboard operation, progress, shuffle, known/review states, reduced motion.
- Quiz: explanations, score, retry incorrect, answer review, and stable grading.
- Mind map: accessible text outline alternative and export.
- Writing outputs: citations, copy/export, and source references.
- Allow saving a chat answer into Studio as a note or draft output.

### Exit gate

- Every output uses exactly the selected sources shown at creation time.
- All output jobs have complete loading, success, failure, retry, and cancellation behavior.
- Structured outputs pass schema validation and viewers have keyboard/mobile coverage.
- Existing output links remain valid through the Learn-to-Studio UI transition.

## Phase 8: Audio Overview

**Objective:** Add a reliable, accessible audio learning output, not a decorative placeholder.

### Contract and pipeline

- Add an `AUDIO_OVERVIEW` output type and explicit states for scripting, synthesis, assembly, and ready/failed.
- Generation options: focus instructions, short/standard/deep length, language, and format/style.
- Generate a grounded script with segment-level citations before synthesis.
- Use a selected TTS provider behind a provider interface; do not hardwire UI contracts to one vendor.
- Store audio in durable object storage with duration, format, size, transcript, segment timing, and citation metadata.
- Implement idempotent generation, cancellation, retry from failed stage, signed playback/download URLs, and cleanup on delete.

### Player experience

- Play/pause, seek, speed, duration, skip, volume, download, and background playback where supported.
- Synchronized transcript with current segment highlighting and source links.
- Accessible transcript is mandatory; audio is never the only way to consume the output.
- Studio card shows generation state, duration, language, and source count.

### Exit gate

- Audio generation survives page navigation and refresh.
- Transcript and citations correspond to the generated script and open correct source locations.
- Failed synthesis can retry without charging/generating completed stages again where provider support allows.
- Playback and transcript work on desktop and mobile browsers.

## Phase 9: Advanced Outputs and Notes

**Objective:** Close the remaining high-value learning and synthesis gaps after the core notebook is stable.

### Candidate outputs

- Video-style explainer as a narrated slide/storyboard output with captions, transcript, citations, thumbnail, and download. Validate user demand before investing in full generative video.
- Presentation outline/slides with editable sections and supporting evidence.
- Data table/timeline extraction with source links.
- Audio file source ingestion with transcription and timestamp citations.

### Notes and composition

- Add notebook notes that can be created manually or saved from chat/output excerpts.
- Notes support citations back to source locations.
- Decide explicitly whether notes participate in grounding; if enabled, index them as a distinct user-authored source class.
- Add export formats based on real need: Markdown first, then PDF/doc-compatible formats.

### Exit gate

- New output types follow the same source snapshot, citation, status, retry, deletion, and accessibility contracts as existing outputs.
- Notes have clear ownership and do not silently alter grounding.
- No “Coming soon” card appears as a working tool.

## Phase 10: Collaboration and Sharing

**Objective:** Evolve from single-user notebooks to safely shareable study workspaces.

### Data and authorization

- Introduce notebook membership with owner/editor/viewer roles.
- Centralize authorization policy instead of scattering ownership checks.
- Add invitation lifecycle, revoke, leave, transfer ownership, and optional link sharing.
- Define which resources collaborators can create/delete and how personal memory remains private.
- Add audit events for membership, sharing, destructive operations, and exports.

### Product behavior

- Dashboard tabs for Mine and Shared.
- Share dialog, member list, role management, and clear private/shared state.
- Shared users see source/output processing updates without manual refresh; adopt server events or another real-time mechanism if justified.
- Add comments or collaborative notes only after basic permissions are proven.

### Exit gate

- Role matrix is covered by authorization tests for every notebook resource.
- Revoked users lose access immediately.
- Personal Mem0 data is never exposed to collaborators.
- Shared links, if supported, have explicit expiration/revocation and no indexing by default.

## Phase 11: Production Hardening, Privacy, and Launch

**Objective:** Meet a dependable production standard under real traffic and external-provider failure.

### Reliability and operations

- Production deployment manifests for client, API, PostgreSQL migrations, and Inngest.
- Staging and production environments with separate databases, object storage, Pinecone indexes, OAuth apps, and secrets.
- Readiness/liveness checks that distinguish API health from optional provider health.
- Structured logs, traces, error monitoring, job dashboards, and alerts for source failure, chat failure, queue age, and provider latency.
- Backups and tested restore procedure for PostgreSQL; lifecycle and deletion checks for object/vector stores.
- Cost dashboards per provider and per feature, plus quota enforcement and abuse controls.

### Privacy and trust

- Publish clear disclosure of which identity/source/chat data reaches Clerk, OpenAI, Pinecone, Firecrawl, Tavily, Mem0, Cloudinary, TTS, and observability vendors.
- Add account/notebook export and deletion workflows that remove PostgreSQL, vectors, stored files/media, and external memory.
- Define retention for deleted resources, logs, failed jobs, and generated media.
- Add consent/control for learned memory, web search, and any provider that stores user content.
- Validate OAuth callback, cookies, CORS, CSP/security headers, upload handling, SSRF protections, and dependency vulnerabilities.

### Testing and release gates

- Unit tests for validators, retrieval helpers, citation mapping, and structured output parsing.
- Integration tests for auth/authorization, database operations, source lifecycle, chat persistence, and jobs with provider fakes.
- E2E tests for login, notebook creation, ingestion, selected-source chat, citation opening, Studio output, mobile navigation, and deletion.
- Load tests for concurrent streams, large notebooks, queue throughput, and dashboard queries.
- Accessibility audit against WCAG 2.2 AA for the critical journey.
- Retrieval/answer evaluation set with release thresholds for groundedness, citation precision, answer relevance, and abstention.

### Exit gate

- Staging passes full E2E, load, accessibility, security, restore, export, and deletion drills.
- SLOs and alert ownership are documented.
- No P0/P1 defects remain in the critical journey.
- Production rollback and migration rollback/forward-fix procedures are rehearsed.

## 7. Cross-Phase Data Model Changes

The exact schema should be finalized with migrations, but the roadmap requires these concepts:

- `NotebookSelection` or equivalent persisted selection/preferences.
- A unique `User.clerkUserId` external identity link while preserving the existing local `User.id` for domain foreign keys.
- Message-level grounding snapshot: selected source IDs, grounding mode, retrieval version.
- Canonical citation records or validated citation JSON version.
- Source processing version, checksum, structured failure code, and lifecycle metadata.
- Typed source metadata for PDF page data, YouTube timestamps, website origin, and future audio segments.
- Output generation options, source/version snapshot, model/provider version, failure stage/code, and media metadata.
- Optional `Note` with citations.
- Later: notebook membership/invitation and audit events.

Do not convert all JSON columns or rename all existing tables in one migration. Introduce versioned contracts, backfill where required, and keep readers tolerant of old records until migration is complete.

## 8. API Contract Principles

- Return a consistent envelope and stable error code for non-streaming endpoints.
- Keep streamed chat errors machine-readable and renderable by the client.
- Validate route ownership in services/repositories, not only in UI or controllers.
- Cursor-paginate conversations, sources, outputs, memories, and later activity lists.
- Add request IDs and idempotency keys to creation/generation/import operations.
- Use signed URLs for private files/media and short-lived access.
- Version payloads that are persisted as JSON, especially citations, source metadata, and output content.
- Expose job stage/failure code without leaking provider secrets or raw stack traces.

## 9. UX State Matrix

The integrated notebook must explicitly support:

- New notebook with no sources.
- Source upload/import in progress.
- Some ready and some processing sources.
- Some or all sources failed.
- Ready sources with no selected source.
- Ready selected sources with no conversation.
- Existing conversation loading, streaming, stopped, failed, or reconnected.
- Citation target available, deleted, or temporarily unavailable.
- No outputs, output generating, ready, failed, cancelled, or deleted.
- Offline/network error and provider-specific recoverable error.
- Notebook missing, unauthorized, shared read-only, or deleted.

Each state needs purposeful copy, permitted actions, retry behavior, and screen-reader announcement where asynchronous.

## 10. Test Pyramid and Required Tooling

### Unit

- Zod validators and type guards.
- Chunk/retrieval/reranking helpers.
- Citation normalization and display labels.
- Output schema parsers and repair logic.
- Permission policy functions.

### Integration

- Express routes against a disposable PostgreSQL database.
- Clerk authentication, local-user resolution, webhook synchronization, and every resource role/ownership boundary.
- Inngest functions with mocked provider adapters.
- Source create/process/retry/delete lifecycle.
- Streaming persistence and cancellation semantics.

### End-to-end

- Clerk auth should use Clerk's supported Playwright/Cypress testing utilities, test keys only, isolated session state, and reusable authenticated storage state where appropriate.
- Cover Google sign-in configuration with a staging smoke test without making every E2E test depend on the external Google UI.
- Cover migrated-user first sign-in and confirm pre-existing notebooks remain available.
- Critical path: create notebook -> add source -> wait for ready -> select -> ask -> open citation -> generate output -> reopen after refresh.
- Mobile Sources/Chat/Studio state preservation.
- Failure/retry journeys and destructive confirmations.

### Quality gates

- Client/server lint and typecheck.
- Prisma validation/generation and migration drift check.
- Production builds.
- Accessibility automation plus manual keyboard/screen-reader checks.
- Visual regression tests for ruled-line alignment, paper textures, handwriting fallbacks, panel resizing, dark mode, and mobile page tabs.
- Bundle/performance budgets and API/stream latency metrics.

## 11. Product and Engineering Metrics

Track metrics that reveal whether Homeworkcopy works, not just whether users click:

- Time from notebook creation to first ready source.
- Source processing success rate and p50/p95 completion time by type.
- First grounded answer time and stream start latency.
- No-context/abstention rate and unsupported-answer rate from evaluations.
- Citation open rate and citation target success rate.
- Selected-source usage and source-count distribution.
- Output generation success, retry, completion, and open rates by type.
- Audio generation success, cost, listen start, and completion rate.
- Weekly active notebooks and return-to-notebook rate.
- Provider cost per active notebook and per successful output.
- Deletion/export completion and external cleanup failure rate.

## 12. Suggested Release Milestones

### Milestone A: Reliable Homeworkcopy Core

Includes Phases 0-4.

User promise: “Add trusted sources, select what matters, ask questions, and verify every answer without leaving your notebook.”

### Milestone B: Complete Study Notebook

Includes Phases 5-7.

User promise: “Import material reliably and turn selected sources into interactive study outputs.”

### Milestone C: Learn Anywhere

Includes Phase 8 and selected Phase 9 outputs.

User promise: “Turn your notebook into a cited audio learning experience and reusable notes.”

### Milestone D: Shared Homeworkcopy

Includes Phase 10 after the authorization model is hardened.

User promise: “Safely study and build notebooks with others.”

### Milestone E: Production Launch Standard

Phase 11 is not optional launch polish. Security, privacy, accessibility, observability, evaluation, backup/restore, and deletion drills are launch requirements and should be developed continuously from Phase 0.

## 13. Immediate Next Sprint

The first implementation sprint should not begin with the three-panel redesign. It should complete this sequence:

1. Fix clean server build and client lint/typecheck gates.
2. Finalize and execute the staged Better Auth-to-Clerk migration, including local-user linking and ownership reconciliation.
3. Fix memory ownership and persisted web citations.
4. Add baseline tests and CI around auth, ownership, and citation fixes.
5. Finalize the canonical citation and selected-source request contracts.
6. Implement the Homeworkcopy ruled-paper tokens, typography roles, and responsive shell prototype behind the current routes.
7. Build selected-source grounding end to end before expanding Studio or adding media outputs.

This order protects existing data and ensures the new UI is wired to trustworthy behavior rather than masking current defects.
