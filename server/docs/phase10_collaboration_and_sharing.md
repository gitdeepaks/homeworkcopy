# Phase 10: Collaboration and Sharing

Last updated: 19 August 2026

## Scope

Phase 10 turns single-owner notebooks into safely shareable ones:

| Deliverable | Shape |
| --- | --- |
| Membership | `NotebookMember` with `EDITOR` / `VIEWER`; the owner stays on `workspace.userId` |
| Central policy | `notebook-access.service.ts` — every notebook resource names a permission |
| Invitations | Email-bound, single-use, hashed token, 14-day expiry, revocable |
| Link sharing | One viewer link per notebook, hashed, always expiring, rotatable, revocable |
| Ownership transfer | Atomic swap; the outgoing owner stays on as editor |
| Audit trail | Membership, sharing, destructive operations, and media exports |
| Dashboard | Mine / Shared with me tabs, role and member count on every card |
| Share dialog | People, Link, and Activity, rendered from the reader's own role |

## Where authority lives

There is exactly one record of who owns a notebook: `workspace.userId`.
`NotebookMember` holds collaborators only, and a database trigger rejects a
membership row for the owner, so the two can never disagree. `NotebookRole` in
the contracts package is therefore an *effective* role — `OWNER` is derived, not
stored:

```
effectiveNotebookRole({ ownerId, userId, membershipRole })
  ownerId === userId        → OWNER
  membership row exists     → EDITOR | VIEWER
  otherwise                 → null   (404, indistinguishable from "no such notebook")
```

Before this phase, ~35 call sites each asked `getWorkspaceByIdForUser`. That
function is gone. Every notebook-scoped service now names the permission it
needs:

```ts
await authorizeNotebook(workspaceId, userId, "source:create");
```

`ROLE_PERMISSIONS` in `@homeworkcopy/contracts` is the only place the answer
lives, and the client reads the same table to decide which controls to render.
Hiding a control is a usability layer, never a security one — the server
re-checks every call.

## The role matrix

| | Viewer | Editor | Owner |
| --- | --- | --- | --- |
| Read sources, chats, outputs, notes | ✓ | ✓ | ✓ |
| See who has access | ✓ | ✓ | ✓ |
| Export what they can already read | ✓ | ✓ | ✓ |
| Add / remove / reprocess sources | | ✓ | ✓ |
| Send chat messages, manage conversations | | ✓ | ✓ |
| Create / edit / delete outputs and notes | | ✓ | ✓ |
| Download output media | | ✓ | ✓ |
| Notebook settings and deletion | | | ✓ |
| Invite, change roles, remove members | | | ✓ |
| Link sharing and ownership transfer | | | ✓ |
| Read the activity trail | | | ✓ |

The roles are strictly nested — viewer ⊆ editor ⊆ owner — and a test asserts it,
so a permission can never be granted to a narrower role than a wider one.

**Why a viewer cannot chat.** Conversations are shared notebook state with no
per-member isolation: a message written by one member is history for all of
them, and generating the answer spends model budget. Letting read-only access
write into that history would make "viewer" mean something it does not say.
Widening this means per-member private conversations — a schema change, not a
matrix change.

**Two failure modes, deliberately different.** A user with no relationship to a
notebook gets `404`, so notebook ids cannot be enumerated. A member whose role is
too narrow gets `403` with a message naming what their role can do.

**Revocation is immediate.** Authorization reads membership on every request, so
removing a member or narrowing their role takes effect on their next call. There
is no cached claim and no session to wait out.

## Invitations and share links

Both are bearer capabilities, so both are stored as SHA-256 of a 256-bit random
token. A database read — or a leaked backup — yields nothing redeemable. The
plaintext is returned exactly once, at creation, and the UI says so.

| | Invitation | Share link |
| --- | --- | --- |
| Who can redeem | Only the invited, verified email | Any signed-in account |
| Grants | `EDITOR` or `VIEWER` | `VIEWER` only |
| Uses | Once (status guard makes concurrent accepts safe) | Many, counted |
| Expiry | 14 days | Up to 90 days, always set |
| Revoke | Per invitation | Per notebook; rotating kills forwarded copies |

Redemption is a button press on a protected page, never something that happens
on load: a link preview, a prefetch, or a mistyped URL must not be able to add
someone to a notebook. Every token-handling route sends
`X-Robots-Tag: noindex, nofollow, noarchive` and `Cache-Control: no-store`, and
both landing pages carry matching `robots` metadata — `SHARE_LINKS_ARE_INDEXABLE`
is `false` and is asserted by a test.

Anonymous link access is not offered. Everyone who can reach a notebook appears
in its member list, which is what makes "remove this person" a complete answer.

Revoking a link stops new joins; it does not evict people who already joined.
They are members now, and removing them is a separate, deliberate act. The share
dialog says this rather than implying otherwise.

## Ownership transfer

`transferWorkspaceOwnership` runs one transaction whose order is forced by the
database: the incoming owner's membership row is deleted first (the trigger
rejects an owner who is also a member), then `workspace.userId` moves, then the
outgoing owner is upserted as `EDITOR`. Transferring is therefore never a way to
lose access to a notebook you built.

## Personal memory stays personal

Mem0 memories are keyed by the authenticated user and served from
`/api/memory`, which is not notebook-scoped. No membership can widen access to
them, and no collaboration code path touches them. This is a structural
property, not a check that could be forgotten.

## Audit trail

`AuditEvent` records membership, sharing, irreversible operations, and signed
media exports. Reads are not recorded: logging every page view of a shared
notebook would bury the events that matter.

Two properties are load-bearing:

- **Writing an audit row never fails the operation it describes.** An audit trail
  that can take down a deletion is worse than one with an occasional gap, and the
  gap is visible in the logs.
- **The actor's name is captured at write time**, and the actor foreign key is
  `SET NULL` rather than `CASCADE`. Deleting an account must not erase the record
  that it changed someone else's access.

`auditEventContextSchema` is re-validated at the write boundary and admits only
identifiers, roles, counts, and short titles. An audit row outlives the resource
it describes, so it must never carry source text, chat content, or anything a
deletion request would have to chase.

Purely client-side Markdown exports are not separately audited: they are
re-renderings of data the member has already read. The signed media URL endpoint
is the one path by which generated content leaves the product, and it is
recorded as `OUTPUT_MEDIA_EXPORTED`.

Notebook deletion is the one destructive operation recorded as a structured log
line instead of an audit row. Audit rows cascade with the notebook, so a
`NOTEBOOK_DELETED` row would be removed by the very operation it records and no
one could ever read it. The event type stays reserved for the account-level trail
that outlives a notebook; until that exists, the log is the durable record.

## Real-time updates for collaborators

Source and output processing already refresh through adaptive polling in
`use-sources.ts` and `use-outputs.ts`. Those queries are notebook-scoped, not
owner-scoped, so a collaborator watching a source finish sees exactly what the
owner sees, with no new transport. Server-sent events were not adopted: they
would add connection management, cross-instance fan-out, and reconnection
semantics to solve a problem the existing polling already solves at this scale.
Revisit if per-notebook polling volume, not collaboration itself, becomes the
constraint.

## API surface

```
GET    /api/workspaces?scope=mine|shared      notebook summaries with the reader's role
GET    /api/workspaces/:id                    one summary, role included
GET    /api/workspaces/:id/sharing            members, invitations, link, viewer role
GET    /api/workspaces/:id/activity           audit trail (owner only)
POST   /api/workspaces/:id/invitations        create; returns the link once
DELETE /api/workspaces/:id/invitations/:id    revoke
PATCH  /api/workspaces/:id/members/:userId    change role
DELETE /api/workspaces/:id/members/:userId    remove
POST   /api/workspaces/:id/leave              give up your own access
POST   /api/workspaces/:id/transfer           hand the notebook to a member
POST   /api/workspaces/:id/share-link         create or rotate; returns the URL once
DELETE /api/workspaces/:id/share-link         revoke
POST   /api/invitations/:token/accept         redeem an invitation
POST   /api/share-links/:token/accept         redeem a share link
```

`scope` defaults to `mine`, so a client that has not adopted the Shared tab sees
exactly what it saw before. Every token route and every invitation/link mint is
behind `authSensitiveRateLimit`.

## Migration

`20260818090000_collaboration_and_sharing` is purely additive. Existing
notebooks keep their owner column and gain no membership rows, which is exactly
what "private" means, so no backfill runs. The migration also creates two objects
Prisma does not model:

- a partial unique index on `(workspaceId, email) WHERE status = 'PENDING'`, so
  one live invitation per address per notebook is enforced by the database while
  revoked and accepted rows never block re-inviting;
- the `notebook_member_reject_owner` trigger described above.

Both are created by the migration itself, so `prisma migrate status` stays clean.

## Tests

| Test | Covers |
| --- | --- |
| `contracts/collaboration.test.ts` | Role matrix consistency and nesting, invitation/link expiry and revocation precedence, token shape, email normalization, audit context redaction |
| `server/notebook-authorization.test.ts` | Every notebook mutation, at every role, through the real authorization path; stranger 404; revocation and downgrade taking effect immediately |
| `server/notebook-access.service.test.ts` | Effective-role derivation, refusal copy |
| `server/share-token.test.ts` | Entropy, uniqueness, hash stability, digest comparison, expiry arithmetic |
| `client/permissions.test.ts` | Client matrix mirrors the server exactly |
| `client/activity.test.ts` | Every audit type has readable copy, including after the actor is deleted |

## Exit gate

- [x] Role matrix covered by authorization tests for every notebook resource.
- [x] Revoked users lose access immediately — membership is read per request.
- [x] Personal Mem0 data is never exposed to collaborators — structurally out of
      the notebook scope.
- [x] Share links carry explicit expiration and revocation, are stored hashed,
      and are never indexed by default.

## Deliberately not in this phase

- Comments and collaborative annotations. The plan gates these on basic
  permissions being proven; they belong on top of this matrix, not beside it.
- Clerk Organizations. A personal notebook is not an organization, and adopting
  them would change the identity model rather than the sharing model.
- Per-member private conversations, which is the prerequisite for letting a
  viewer chat.
