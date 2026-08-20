# Operations Runbook

Last updated: 20 August 2026

Everything here is meant to be *rehearsed*, not read for the first time during an
incident. A restore procedure nobody has run is a hope, not a procedure.

## Contents

- [Environments](#environments)
- [Deploying](#deploying)
- [Rolling back](#rolling-back)
- [Migrations](#migrations)
- [Backup and restore](#backup-and-restore)
- [Health, metrics, and alerts](#health-metrics-and-alerts)
- [SLOs and ownership](#slos-and-ownership)
- [Drills](#drills)

## Environments

Staging and production share **nothing**. Not a database, not an object storage
account, not a Pinecone index, not a Clerk instance, not a provider key.

The reason is specific rather than general: several of this product's operations
are destructive across service boundaries. An account deletion in staging walks
Pinecone namespaces, destroys Cloudinary objects, and deletes a Clerk user. If
any of those credentials point at production, a staging deletion drill destroys
production data, and it will do so successfully and without complaint.

| Resource | Separated by |
| --- | --- |
| PostgreSQL | Separate managed instance |
| Pinecone | Separate index — `PINECONE_INDEX` |
| Cloudinary | Separate cloud, or at minimum a separate folder prefix and API key |
| Clerk | Separate instance, test keys only in staging |
| Inngest | Separate app environment and signing key |
| OpenAI / Tavily / Firecrawl / Mem0 | Separate keys, so spend is attributable |

The API refuses to start in production when a required secret is missing, when
`INNGEST_DEV` is set, when `ALLOW_PRIVATE_NETWORK_FETCH` is set, or when
`CLIENT_URL` is not https. See `server/src/config/env.ts`; those checks exist so a
misconfiguration is a failed deploy rather than a live incident.

## Deploying

Order matters and is not negotiable:

1. **Build images.** `server/Dockerfile`, `client/Dockerfile`,
   `deploy/migrate.Dockerfile`. Tag all three with the same commit SHA — a
   deploy where the API and the migration job come from different commits is the
   one that produces a schema nothing matches.
2. **Run migrations to completion.** The migration job is separate from the API
   precisely so this is a discrete step with its own success signal. An API that
   migrates on boot races itself the moment it has two replicas.
3. **Roll out the API.** New instances must pass `GET /health/ready` before the
   load balancer sends them traffic.
4. **Roll out the client.**
5. **Point Inngest at the new deployment.** Inngest Cloud calls
   `POST /api/inngest` on the API; there is nothing separate to deploy, only the
   app URL to confirm and `INNGEST_SIGNING_KEY` to have set.

Rehearse the whole sequence locally first:

```bash
cp deploy/.env.staging.example .env
docker compose up --build          # add --profile local-jobs to run jobs too
```

### Probes

| Probe | Path | Configure as |
| --- | --- | --- |
| Liveness | `GET /health/live` | Restart on failure |
| Readiness | `GET /health/ready` | Remove from rotation on failure |
| Detail | `GET /health/detail` | Dashboard only; requires `X-Ops-Token` |

Do **not** point liveness at `/health/ready`. Readiness fails when the database
is unreachable, and restarting every API instance during a database blip
converts a recoverable incident into a full outage with a cold start at the end
of it.

## Rolling back

**Application rollback** is redeploying the previous image tag. It is safe
whenever the schema has not changed.

**When the schema has changed, prefer forward-fix.** Prisma migrations are
forward-only; there is no `migrate down`. Rolling an application back onto a
newer schema works only if the migration was additive, which is why migrations
in this repo are written to be:

- add columns as nullable or with a default, never `NOT NULL` without one;
- add tables and indexes rather than renaming or dropping;
- keep readers tolerant of old rows — see `readAuditEventContext`,
  `readOutputMetadata`, and the versioned JSON payloads generally.

A destructive change is therefore two deploys: stop writing the old shape, then,
once the previous version is out of the rollback window, drop it.

If a migration must be undone, write a new forward migration that reverses it and
deploy that. Restoring the database to undo a schema change loses every write
since the backup, which is almost always worse than the schema problem.

## Migrations

```bash
# What is applied, and what is pending.
bun run --cwd server prisma:migrate:status

# Apply. This is the only migration command that belongs in a deploy: it never
# generates, never resets, and never prompts.
bun x --cwd server prisma migrate deploy
```

Two objects in this schema are not modelled by Prisma and are created by the
migrations themselves — the partial unique index on pending invitations, and the
`notebook_member_reject_owner` trigger. Do not drop and recreate the database
from `db push`; it will silently lose both, and the second one is a privilege
boundary.

## Backup and restore

### What has to be backed up

| Store | Method | Notes |
| --- | --- | --- |
| PostgreSQL | Managed provider's automated backups **plus** point-in-time recovery | The system of record |
| Cloudinary | Provider retention; uploads are re-derivable only from the reader's own files | Generated media is not re-derivable |
| Pinecone | **Not backed up** | Rebuildable from sources — see below |

Vectors are deliberately not backed up. Every vector is derived from a
`source_chunk` row that PostgreSQL holds, so a Pinecone loss is a reprocessing
job rather than a data loss. Backing them up would mean keeping two copies of the
same content in sync across a deletion request, which is a worse problem than the
one it solves.

### Taking a backup

```bash
pg_dump --format=custom --no-owner --no-privileges \
  --file="homeworkcopy-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DATABASE_URL"
```

### Restoring — rehearse this quarterly

Restore into a **new** database and cut over. Never restore over a live one: if
the restore is wrong, the original is the only way to find that out.

```bash
createdb homeworkcopy_restore
pg_restore --no-owner --no-privileges --dbname=homeworkcopy_restore backup.dump

# The restore is only complete when the schema matches the code that will read
# it. This must print no pending migrations.
DATABASE_URL=postgresql://.../homeworkcopy_restore \
  bun run --cwd server prisma:migrate:status
```

Then verify before cutting over:

1. Row counts for `user`, `workspace`, `source`, `message` are within expectation.
2. A known notebook opens and its sources list.
3. A chat turn returns a grounded answer with citations that resolve — this is
   the check that proves PostgreSQL and Pinecone still agree.
4. If they do not agree, reprocess affected sources rather than restoring
   Pinecone; the chunks in PostgreSQL are authoritative.

### After a restore: the external stores

A restore moves PostgreSQL back in time. The external stores do not move with it,
so two things need attention:

- **Objects deleted since the backup are gone**, but the restored rows point at
  them. Those sources and outputs will fail to load. Reprocessing a source fixes
  it if the reader's original upload survives.
- **Accounts deleted since the backup are back.** This is the serious one: a
  restore can resurrect data someone asked to have deleted. Read
  `deletion_receipt` — it survives the account it describes, which is why it has
  no foreign key — and re-run deletion for every `COMPLETED` receipt whose
  subject hash matches a restored user. `deletionSubjectHash(userId)` in
  `server/src/services/account-deletion.service.ts` computes the match.

## Health, metrics, and alerts

`GET /metrics` serves Prometheus text format and requires `X-Ops-Token`.

| Metric | What it answers |
| --- | --- |
| `homeworkcopy_http_requests_total` | Error rate by route class |
| `homeworkcopy_http_request_duration_seconds` | API latency |
| `homeworkcopy_source_processing_total` | Are sources getting through, and why not |
| `homeworkcopy_chat_turns_total` | Are answers being produced |
| `homeworkcopy_output_generation_total` | Studio success and failure by type |
| `homeworkcopy_provider_latency_seconds` | Which provider is slow |
| `homeworkcopy_provider_cost_usd_total` | Spend by provider and by feature |
| `homeworkcopy_job_queue_age_seconds` | How long work waits before a worker takes it |
| `homeworkcopy_privacy_operations_total` | Export and deletion outcomes |
| `homeworkcopy_retention_purged_total` | That retention actually ran |

Metrics are per-instance; a scraper sums across targets.

### Alerts worth waking someone for

| Alert | Condition | Why it matters |
| --- | --- | --- |
| API error rate | `5xx` share > 2% over 5m | Readers are seeing failures |
| Readiness failing | `/health/ready` failing on > 1 instance for 2m | Capacity is going away |
| Source failure rate | > 20% of ingestions failing over 15m | The core promise is broken |
| Chat failure rate | > 5% of turns failing over 10m | Answers are not being produced |
| Queue age | p95 `job_queue_age_seconds` > 300 for 10m | Work is queued and not running |
| Provider latency | p95 > 30s for a required provider over 10m | Degradation before failure |
| Deletion incomplete | any `privacy_operations{operation="deletion",outcome="incomplete"}` | A deletion request is unfulfilled — a compliance obligation, not just a bug |
| Retention silent | no `retention_purged_total` increase in 48h | The purge job has stopped |
| Cost step change | daily `provider_cost_usd_total` > 2× trailing 7-day mean | A runaway loop or an abuse pattern |

The deletion alert is the one people are most tempted to downgrade. Don't: an
`INCOMPLETE` receipt means someone asked to be forgotten and part of their data
is still held, and the walk retries but will not resolve a provider that keeps
refusing.

## SLOs and ownership

| SLO | Target | Window |
| --- | --- | --- |
| API availability | 99.5% of requests non-`5xx` | 30 days |
| Chat stream start | p95 < 3s | 7 days |
| Source ready (PDF ≤ 10 MB) | p95 < 90s | 7 days |
| Studio text output | p95 < 60s | 7 days |
| Export delivered | p95 < 10 min | 30 days |
| Account deletion completed | 100% within 24h | 30 days |

Ownership must be written down here with real names before launch, not left as a
table shape. At minimum: a primary on-call, a secondary, and a named owner for
each of database, job pipeline, and provider spend. An alert with no owner is a
notification.

## Drills

Run before launch, and quarterly after.

- [ ] **Restore drill.** Restore the latest backup to a new database, run the
      verification checklist above, and record how long it took.
- [ ] **Deletion drill.** In staging: create an account with sources, outputs
      with media, and memories; delete it; confirm the receipt is `COMPLETED`,
      the Pinecone namespace is empty, the Cloudinary objects are gone, the
      memories are gone, and the Clerk user is gone.
- [ ] **Export drill.** Request an account export, download it, confirm the
      manifest counts match the account and that the link stops working after it
      expires.
- [ ] **Rollback drill.** Deploy, then redeploy the previous tag, and confirm the
      product works throughout.
- [ ] **Provider outage drill.** Revoke a Tavily or Mem0 key in staging and
      confirm the product still answers from notebook sources, that readiness
      stays green, and that `/health/detail` shows the degradation.
- [ ] **Load test.** Concurrent chat streams, a large notebook, and queue
      throughput. Record the numbers against the SLO table.
- [ ] **Accessibility pass.** WCAG 2.2 AA over the critical journey — create
      notebook, add source, select, ask, open citation, generate output — with a
      keyboard only and with a screen reader.
