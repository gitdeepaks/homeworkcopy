# Phase 11: Production Hardening, Privacy, and Launch

Last updated: 20 August 2026

## Scope

Phase 11 is the difference between a product that works and one that can be run.

| Deliverable | Shape |
| --- | --- |
| Typed environment | `config/env.ts` — production fails at boot, not at first request |
| Probes | `/health/live`, `/health/ready`, `/health/detail` — three different questions |
| Observability | `lib/metrics.ts` Prometheus registry, `lib/cost.ts` spend by feature |
| Security headers | API middleware plus a real CSP in `client/next.config.ts` |
| SSRF guard | `lib/url-guard.ts` — resolve, check every address, re-check every redirect |
| Consent | `UserPrivacySetting`, enforced at the provider boundary |
| Disclosure | `DATA_PROCESSORS` — a compile-checked record of who receives what |
| Export | Async job, authenticated storage, signed link, seven-day life |
| Deletion | Five stores, walked in a forced order, with a receipt that outlives the account |
| Retention | One policy table read by both the disclosure and the purge job |
| Deployment | Dockerfiles for API, client, and migrations; a compose stack to rehearse with |
| Runbook | `deploy/RUNBOOK.md` — deploy, rollback, restore, alerts, SLOs, drills |

## Three questions a health check is asked

Collapsing them is how a Tavily outage becomes a rolling restart of every API
instance: the platform sees a failing probe and does the only thing it knows.

```
/health/live     Should this process be restarted?     Touches nothing.
/health/ready    Should this instance get traffic?     Database only.
/health/detail   What is going on?                     Everything. Ops token.
```

`REQUIRED_HEALTH_COMPONENTS` contains exactly `database`. Every other component
is reported and never enforced, because the product still answers questions from
notebook sources when web search is unreachable — and an instance that removes
itself from the load balancer over that has made the outage larger than it was.

`NOT_CONFIGURED` is a healthy answer. A deployment that never set a web-search key
is correctly configured, not degraded, and `aggregateHealthStatus` says so.

The detailed report and `/metrics` **404 without `OPS_TOKEN`** rather than 401.
An endpoint that returns 401 still confirms it exists.

Optional providers are reported as configured rather than probed. Calling a paid
endpoint every fifteen seconds to ask whether it is alive is not a trade worth
making; the real signal for those is `homeworkcopy_provider_calls_total`, measured
from traffic that was going to happen anyway.

## The environment is a schema

`parseEnv` validates the whole environment at boot and **collects** problems
rather than throwing at the first one — a deployment with three missing secrets
should learn about three, not discover them one restart at a time.

Production additionally refuses to start when:

- any of the required secrets is missing;
- `INNGEST_DEV` is set — it disables job signature verification;
- `ALLOW_PRIVATE_NETWORK_FETCH` is set — it disables the SSRF guard;
- any `CLIENT_URL` entry is not https.

`TRUST_PROXY_HOPS` is a number and defaults to `0`. `app.set("trust proxy", true)`
tells Express to believe the left-most `X-Forwarded-For` entry, which the client
writes — every address-keyed rate limit becomes bypassable by adding a header.
Counting the hops is the only correct answer, and guessing high is worse than
guessing low.

Existing modules still read `process.env` for their own defaults. This module does
not replace them; it validates everything in one place, before anything uses it.

## The outbound address check

Several endpoints take a URL from a reader and fetch it. Without a guard, each is
a request forgery primitive: the API sits inside a private network with a
database, a metadata service at `169.254.169.254`, and whatever else the platform
exposes on loopback.

Two things make this hard, and both are handled:

**A hostname is not an address.** `localtest.me` resolves to `127.0.0.1`, and an
attacker's own domain resolves to whatever they like. Blocking the literal string
`localhost` catches nothing. So every hostname is resolved and *every* address it
resolves to is checked — one public and one loopback address is a refusal, because
which one a later connection picks is not ours to decide.

**A redirect is a second request.** A public URL that 302s to
`http://169.254.169.254/` defeats a check done once on the URL that was typed. So
`guardedFetch` follows redirects itself, re-checking each hop, rather than letting
`fetch` follow them for it.

Also refused: non-http schemes, embedded credentials (`http://user:pass@host/`),
ports outside 80 and 443, and `.localhost`, which resolvers honour without ever
asking DNS.

There remains a window between the check and the connection in which DNS could
change. Closing it means pinning the connection to a verified address, which
Node's fetch does not expose. The residual risk is one request to an
attacker-chosen internal address whose body they never see, and it is documented
in the file rather than hidden.

Applied at three places: the website import endpoint, the scrape itself, and the
stored-PDF download. The last one is guarded even though the URL came from our own
upload — `fileUrl` is a value read back out of a row that has survived several
schema versions, and "it is trusted because of where it originally came from" is
the assumption these bugs are made of.

## Consent that means something

A consent toggle is worth nothing unless the code path it names checks it. There
are two switches, both **default off**, both read on every request rather than
cached — withdrawing consent has to take effect on the next call, not whenever a
session happens to expire.

| Switch | Gates |
| --- | --- |
| `learnedMemory` | Every call to the memory provider: recall during chat, learning from a turn, **and memories written by hand** |
| `webSearch` | Web-grounded chat |

Manual memories are included deliberately. The disclosure tells a reader that
with this off, nothing about them is held by the memory provider — and a
hand-written memory still being stored there would make that sentence false. One
coarse switch that is true beats three fine ones that are not.

Reading and deleting memories are not gated. Someone who has just turned memory
off needs to see what is still stored in order to remove it, and removing data
must never be harder than storing it was.

An account with no `user_privacy_setting` row reads as
`DEFAULT_PRIVACY_PREFERENCES`, which has both switches down. Nothing is opted in
by having existed before this phase shipped, and the migration deliberately
backfills nothing.

## The disclosure cannot drift

`DATA_PROCESSORS` is `Record<DataProcessorId, DataProcessor>`, not an array. A
provider added to the enum without an entry is a compile error, so "we forgot to
document that one" stops being a thing that can happen.

The page a reader sees lists only the processors their *current* choices admit.
"Here is everywhere anyone's data could go" is a legal notice; "here is where
yours goes" is an answer.

## Deletion, in the order the stores require

```
vectorIndex  →  objectStorage  →  learnedMemory  →  identityProvider  →  database
```

The database goes **last**, and this is the single most important property in
`account-deletion.service.ts`. Every other store is addressed by an identifier
only the database holds — which Pinecone namespaces, which storage objects, which
export archives. Dropping the user row first leaves all of them orphaned, paid
for, and unreachable, which means the data is not actually gone.

A failure does not stop the walk. If object storage is having an outage, the
vectors and the memories should still go, and the account row **stays** so a retry
has something to walk again. The receipt records which stores confirmed, so "is it
gone?" has an answer rather than a hope.

`SKIPPED` is distinct from `FAILED`. A store this deployment never wrote to — an
optional provider that was never configured — is not the same as one that refused,
and someone asking whether their data is gone deserves to see which.

The receipt holds **no personal data and no foreign key**. It has to outlive the
row it describes, and a receipt carrying the email of someone who asked to be
forgotten would defeat its own purpose. `subjectHash` is SHA-256 of the deleted
user id: enough to match a support request against a receipt, not enough to
identify anyone from the table.

An incomplete deletion throws, so the job runner retries rather than reporting a
successful run over an unfinished one.

### A gap this phase closed

`deleteWorkspaceForUser` cleared Pinecone and the database row but never the
Cloudinary objects. Every deleted notebook left its uploaded PDFs, audio sources,
and generated media behind — unreachable, undeletable, and still billed. Both
deletion paths now walk `stored-object.service.ts`, which finds objects from the
rows that own them rather than by listing a storage folder.

Notebook deletion treats object cleanup as best-effort and logs failures; account
deletion treats them as fatal to the receipt. The asymmetry is deliberate: a
notebook the reader asked to delete must disappear even during a provider outage,
while an account deletion that quietly left media behind would be a false claim.

## Export

Not synchronous, not a public link, not permanent, not other people's data.

- **A job**, because an account with a hundred notebooks is minutes of database
  work and a request would time out with the reader unable to tell whether it
  worked.
- **An authenticated object with a signed URL** minted per download after the
  ownership check, because the archive is the densest concentration of one
  person's data the product ever writes.
- **Seven days**, then the bytes are deleted and the row is marked `EXPIRED` —
  which is why the settings page can say "that export expired" instead of showing
  an empty space where a download used to be.
- **Owned notebooks only.** A notebook shared with you is someone else's data,
  held under their deletion request; copying it into a second archive would put it
  beyond their reach.

`EXPORT_EXCLUSIONS` is published on the page, so a reader can tell the difference
between "not exported" and "not held". Learned memories are on that list because
they are managed and deleted at the provider under their own controls, and copying
them into an archive would create a second place a deletion request has to chase.

`notebook:export` was added to the role matrix and granted to viewers. Withholding
a copy of what someone can already read on their screen does not protect the data;
it only makes leaving harder, which is not a security property.

## Retention

`RETENTION_POLICY` lives in the contracts package and is read by both the
published disclosure and the nightly purge job. There is no second copy of the
numbers, so the page cannot come to disagree with what actually runs.

| Resource | Kept |
| --- | --- |
| Audit events | 365 days |
| Chat usage counters | 90 days |
| Resolved invitations | 90 days |
| Clerk webhook receipts | 30 days |
| Failed outputs | 30 days |
| Expired share links | 30 days |
| Export archives | 7 days |
| Deletion receipts | Indefinitely |

Anything a reader deletes goes immediately; this is the other half — the rows that
accumulate because they are nobody's. The deletion receipt is the one thing kept
forever, and a test asserts it is the only one.

Expired archives are destroyed in bounded batches, and the row is marked expired
only after the bytes are actually gone. Deleting the row first would strand the
archive: the storage id lives only on the row.

## Typed jobs

`InngestEvents` existed but was never wired to anything, so every `inngest.send`
took any name with any payload. Inngest v4 removed `EventSchemas`, so the union is
now enforced through `sendInngestEvent`, which every emitter calls. A renamed field
is a compile error rather than a job that fails in production some seconds after
the request that queued it already returned success.

## Deployment

| File | Purpose |
| --- | --- |
| `server/Dockerfile` | API. Three stages; ships `dist` and production deps only, runs as `node`, `tini` as PID 1 so SIGTERM is honoured |
| `client/Dockerfile` | Client. Next standalone output, traced from the workspace root so the contracts package is included |
| `deploy/migrate.Dockerfile` | Migrations. A separate image, so `migrate deploy` is a discrete step with its own success signal |
| `docker-compose.yml` | The four pieces wired in deploy order, for rehearsal |
| `deploy/RUNBOOK.md` | Deploy, rollback, backup/restore, alerts, SLOs, drills |

Migrations are a job rather than something the API does on boot, because an API
that migrates at startup races itself the moment it has two replicas.

Inngest has no manifest because in production it is hosted and calls the API's
`/api/inngest` endpoint. The compose file carries a `local-jobs` profile with the
dev server for offline rehearsal.

Vectors are deliberately not backed up: every vector is derived from a
`source_chunk` row PostgreSQL holds, so a Pinecone loss is a reprocessing job.
Backing them up would mean keeping two copies in sync across a deletion request,
which is a worse problem than the one it solves.

The runbook's restore section carries the consequence most restore procedures
miss: **a restore can resurrect accounts that asked to be deleted.** That is what
`deletion_receipt` is for, and why it has no foreign key.

## Migration

`20260820090000_production_hardening_and_privacy` is purely additive: three
tables, three enums, and two indexes retention needs to purge by age without
scanning. Nothing backfills, which is what makes every existing account start with
optional processing off.

## Tests

| Test | Covers |
| --- | --- |
| `contracts/privacy.test.ts` | Disclosure completeness, consent defaults and gating, retention arithmetic, deletion completeness, health aggregation |
| `server/config/env.test.ts` | Boot validation, production refusals, multi-problem reporting, origin parsing |
| `server/lib/url-guard.test.ts` | Every private range in both families, IPv4-mapped IPv6, schemes, credentials, ports, `.localhost` |
| `server/lib/metrics.test.ts` | Label-set identity, escaping, bucket accumulation, cost estimation |
| `server/middleware/security-headers.test.ts` | Every header, and that HSTS is absent outside production |
| `server/services/account-deletion.test.ts` | Subject hash properties, per-target failure, skipped-vs-failed, database coverage |

## Exit gate

- [x] Readiness distinguishes API health from optional provider health.
- [x] Structured logs, request ids, metrics, provider latency, queue age, and
      per-feature cost are exposed.
- [x] Backup and tested restore procedure documented, including the external-store
      consequences a restore has.
- [x] Deletion removes PostgreSQL, vectors, stored files and media, external
      memory, and the sign-in identity, with a receipt.
- [x] Export covers everything the account holds and expires.
- [x] Retention defined for logs, receipts, failed jobs, and generated archives.
- [x] Consent for learned memory and web search, enforced at the provider
      boundary and default off.
- [x] Security headers, CORS allowlist, CSP, upload validation, and SSRF
      protection in place.
- [x] Unit tests for the new validators, guards, and policy functions.
- [ ] **Load test** against the SLO table — `deploy/RUNBOOK.md`.
- [ ] **Accessibility audit** to WCAG 2.2 AA over the critical journey.
- [ ] **Drills rehearsed** — restore, deletion, export, rollback, provider outage.
- [ ] **Alert ownership named** with real people.

The four unchecked items are exercises against a running staging environment, not
code. They are listed rather than quietly dropped because Phase 11's exit gate is
"staging passes the drills", and nothing in this repository can assert that on its
own.

## Deliberately not in this phase

- **A grace period on account deletion.** A "you have 30 days to change your mind"
  window means holding data someone asked to have deleted, plus a scheduler, plus
  a cancellation path. Worth adding, but it is a product decision about what
  deletion means, not a hardening one.
- **Per-notebook export from the notebook UI.** The API and permission exist;
  only the settings page currently calls it.
- **A hosted error-monitoring vendor.** Errors are structured, coded, and counted.
  Choosing a vendor adds a processor to the disclosure, so it should be a
  deliberate decision rather than a dependency added in passing.
- **Distributed rate limiting.** Limits are per-instance. With more than one API
  instance the effective limit multiplies by the instance count, which is fine at
  this scale and needs a shared store when it is not.
