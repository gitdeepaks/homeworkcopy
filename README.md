# Homeworkcopy

Homeworkcopy is a Next.js client and standalone Express API managed as a Bun workspace.

## Prerequisites

- Bun 1.2.20 or compatible
- PostgreSQL 17
- Separate Clerk development, staging, and production instances

## Setup

1. Copy `client/.env.example` to `client/.env` and `server/.env.example` to `server/.env`.
2. Configure Clerk Google OAuth, `/sso-callback`, allowed origins, and production domains in each Clerk instance.
3. Run `bun install`, `bun run generate`, and `bun x --cwd server prisma migrate deploy`.
4. Start the API with `bun run --cwd server dev` and client with `bun run --cwd client dev`.
5. For local Inngest, run a pinned CLI version and point it to `http://localhost:8080/api/inngest`.

## Quality Gates

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run check`

CI performs a frozen install, Prisma generation/validation, migration deployment/status, static checks, tests, and production builds.

## Clerk Migration

Clerk is the only accepted session authority. PostgreSQL `User.id` remains the domain ownership key; `User.clerkUserId` links external identities. Browser and server requests to Express use Clerk bearer tokens.

The verified webhook endpoint is `POST /api/webhooks/clerk`. Configure `CLERK_WEBHOOK_SIGNING_SECRET` and subscribe to `user.created`, `user.updated`, and `user.deleted`. Webhook events are deduplicated by `svix-id`. Clerk deletion disconnects the identity but retains domain data pending the explicit retention policy.

Run `bun run --cwd server auth:reconcile` before cutover and after first-login migration. It exits nonzero for unlinked users or duplicate normalized emails and reports notebook ownership counts. Do not remove legacy `Session`, `Account`, or `Verification` tables until this report passes and the rollback window closes. Existing Better Auth sessions are not accepted and users must sign in with Google again.

Production policy defaults: one active Clerk session per browser profile, Google OAuth only, Clerk bot protection enabled, and no automatic domain-data cascade on Clerk account deletion. MFA/passkeys require a separate reviewed rollout.

## Environment

- Client: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `API_URL`, `NEXT_PUBLIC_APP_URL`.
- Server auth: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `CLIENT_URL`.
- Optional features: `MEM0_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`.
- Audio Overview: `TTS_PROVIDER` (default `openai`), `TTS_MODEL`, plus `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` for signed media storage. `GET /api/capabilities` reports whether both halves are configured, and Studio disables the output type with an explanation when they are not. See `server/docs/phase8_audio_overview.md`.
- Production Inngest: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`; use `INNGEST_DEV=1` only locally.

Secrets, webhook signing keys, and Clerk secret keys are server-only. Keep test and production keys strictly separated.
