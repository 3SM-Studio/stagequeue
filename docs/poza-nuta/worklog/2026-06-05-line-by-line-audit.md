# Poza Nutą — line-focused repo audit and Codex next steps

Date: 2026-06-05  
Scope: `/mnt/data/poza-nuta.zip` extracted into `/mnt/data/repo_audit`  
Method: static repo inspection, targeted line-focused review of runtime/security/architecture files, source-package hygiene check, Node strip-types syntax check.

## What I could verify locally

- Source package hygiene check passed: `node scripts/check-clean-package.mjs`.
- Strip-types syntax check passed for 80 TypeScript files: `node --experimental-strip-types scripts/typecheck.mjs`.
- Full `pnpm install`, `pnpm typecheck`, `pnpm test`, Next builds and Fastify integration tests were not run because the extracted ZIP has no `node_modules`, this environment has no `pnpm` installed, and runtime packages such as `next`, `fastify`, `drizzle-orm` and `better-auth` are not available locally.

This audit is therefore a static/architectural audit, not a full CI result.

---

## Executive verdict

The repo is no longer a toy. It has a real target architecture: Fastify API, PostgreSQL/Drizzle, Better Auth, Next public/dashboard apps, SSE-first realtime, documented standards, ADRs, checklists, AGENTS guidance, migrations and tests.

The weak points are not “missing docs” anymore. The weak points are operational and product-hardening gaps:

1. CI is still an example, and it is wrong for this repo.
2. Public event-id endpoints bypass venue public-visibility checks.
3. Platform owner support access is still a broad MVP shortcut.
4. SSE is in-memory and single-instance only.
5. Dashboard operator queue still uses manual/poll refresh instead of the existing SSE stream.
6. Event lifecycle mutations rely on a DB unique constraint but do not map its conflict path.
7. API/frontend contracts are duplicated manually instead of generated/shared.
8. Legacy app/API are still present and still part of mental overhead.

---

## P0 / blocking before serious production

### P0-1 — CI config is example-only and mismatched with repo tooling

**Files/lines**

- `package.json:5` — package manager is `pnpm@10.17.1`.
- `package.json:39-40` — engine requires Node `>=24`.
- `.nvmrc:1` — repo expects Node `24`.
- `.github/workflows/ci.example.yml:13-21` — uses Node `22`, `npm ci`, and `npm run ...`.

**Problem**

The repo says “Node 24 + pnpm”, but the CI example says “Node 22 + npm”. That is not a harmless mismatch. It means Codex or a human can copy this and get a CI that does not represent local/runtime truth.

**Fix**

Create a real `.github/workflows/ci.yml` using Node 24, `corepack`, `pnpm install --frozen-lockfile`, and repo scripts:

- `pnpm check:clean-package`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Keep `ci.example.yml` only if clearly marked as generic template, but better remove/replace it.

---

### P0-2 — Public event-id endpoints can bypass venue visibility

**Files/lines**

- `apps/api/src/modules/queue/routes.ts:107-123` — `/public/events/:eventPublicId/stream` and `/public/events/:eventPublicId/queue` read event by UUID and call queue service.
- `apps/api/src/modules/queue/routes.ts:126-145` — `/public/events/:eventPublicId/requests` submits directly by event UUID.
- `apps/api/src/modules/queue/routes.ts:277-292` — venue-slug path uses `requirePublicVenueLookup`, which checks public venue flow.
- `apps/api/src/modules/events/service.ts:412-429` — venue lookup checks `isVenuePubliclyVisible`.
- `apps/api/src/modules/queue/service.ts:494-523` — event context joins event+venue but does not select or check venue `status`/`verificationStatus`.

**Problem**

Venue-slug public routes correctly require a publicly visible venue. Direct event UUID routes do not. If an event UUID leaks, a queue may be readable/submittable even if the venue is draft/unverified, as long as the event is active and its public flags allow it.

**Fix options**

Option A: Remove direct public event UUID routes from public web and public API unless they use a separate public ID with explicit visibility rules.

Option B: Change `getEventContext` or route-level public guard to select venue `status` and `verificationStatus`, and reject if `!isVenuePubliclyVisible(venue)`.

**Acceptance tests**

- `GET /public/events/:id/queue` returns `404` or `403` when venue is draft/unverified.
- `POST /public/events/:id/requests` rejects for draft/unverified venue.
- Existing venue-slug happy paths still pass.

---

### P0-3 — Platform owner support access is too broad for production

**Files/lines**

- `apps/api/src/permissions/service.ts:70-73` — `platform_owner` support access helper.
- `apps/api/src/permissions/service.ts:95-96` — all event-scoped permissions are granted to platform owner.
- `README.md:554` — documents this as MVP support access and says it should become audited support access or impersonation.

**Problem**

This is acceptable for MVP/demo, but not acceptable as silent production behavior. Platform owner can operate any event queue and dashboard event stream. That may be intentional support access, but it must be explicit, audited and ideally time-bound or feature-flagged.

**Fix**

Introduce one of:

- `SUPPORT_ACCESS_ENABLED=false` by default in production;
- explicit support session / impersonation model;
- audit log entry for every support access;
- separate permission `platform.support_events`, not implicit `platform_owner` blanket access.

**Acceptance tests**

- Platform owner cannot operate tenant event when support access disabled.
- Platform owner can operate only when support access is enabled and audit event is written.

---

## P1 / high priority hardening

### P1-1 — SSE exists, but dashboard operator view does not use it

**Files/lines**

- `apps/api/src/modules/queue/routes.ts:149-159` — dashboard event stream exists.
- `apps/api/src/modules/streams/eventStreams.ts:22-34` — stream subscribes, heartbeats, and cleans up.
- `apps/dashboard-web/components/OperatorQueueView.tsx:101-125` — dashboard uses focus/visibility/interval refresh.
- `apps/dashboard-web/components/OperatorQueueView.tsx:211-214` — UI explicitly says `manual refresh`.
- `apps/dashboard-web/lib/apiClient.ts:203-205` — stream URL builder already exists.

**Problem**

Backend already supports dashboard SSE, but the operator screen still runs as polling/manual refresh. This wastes the realtime infrastructure and makes operator UX worse than public queue UX.

**Fix**

Mirror public-web SSE pattern from `apps/public-web/components/PublicQueueView.tsx:23-58` inside dashboard operator view:

- open `EventSource(buildDashboardEventStreamUrl(eventId), { withCredentials: true })`;
- listen to queue/event events;
- schedule coalesced refresh;
- close on unmount;
- retain polling as fallback only.

---

### P1-2 — In-memory event bus is single-instance only

**Files/lines**

- `apps/api/src/plugins/eventBus.ts:45-47` — default event bus is in-memory.
- `apps/api/src/plugins/eventBus.ts:49-94` — subscribers live in a process-local `Map`.
- `docs/poza-nuta/adr/ADR-007-sse-first.md` — SSE-first is accepted, but this repo still lacks distributed pub/sub.

**Problem**

This works only when the request that mutates state and the SSE client are connected to the same API instance. With multiple Railway instances, containers, or serverless-like scaling, events can disappear from a client’s perspective.

**Fix**

For next production step, add one of:

- Postgres `LISTEN/NOTIFY` event bus;
- Redis pub/sub;
- managed pub/sub.

Keep in-memory bus for tests/dev.

---

### P1-3 — Event lifecycle race can become raw 500 on unique conflict

**Files/lines**

- `packages/db/src/schema.ts:257-259` — unique partial index allows one active/paused event per venue.
- `apps/api/src/modules/events/service.ts:263-306` — lifecycle change starts/resumes event.
- `apps/api/src/modules/events/service.ts:275-277` — service checks if another running event exists.
- `apps/api/src/modules/events/service.ts:279-285` — updates event status.
- `apps/api/src/modules/events/service.ts:629-631` — transaction wrapper does not map unique violations.
- `apps/api/src/modules/events/service.ts:514-525` — create-event maps unique violations, but lifecycle does not reuse it.

**Problem**

Two concurrent starts/resumes can race. The DB unique index protects integrity, good. But the lifecycle service does not map that unique violation to `409 VENUE_HAS_ACTIVE_EVENT`; it can surface as a generic 500 depending on error handler path.

**Fix**

Map `events_one_active_or_paused_per_venue_unique` in lifecycle transactions too.

**Acceptance test**

Simulate unique violation in lifecycle start/resume and assert controlled `409 VENUE_HAS_ACTIVE_EVENT`.

---

### P1-4 — Event date patch validation is incomplete

**Files/lines**

- `apps/api/src/modules/events/service.ts:220-240` — patch builds partial update.
- `apps/api/src/modules/events/service.ts:222` — validates only `input.startsAt` and `input.endsAt` as provided.
- `apps/api/src/modules/events/service.ts:496-504` — date validator returns early when one side is missing.

**Problem**

If an event already has `startsAt`, patching only `endsAt` can create `endsAt <= existing.startsAt`. Same for patching only `startsAt` against existing `endsAt`.

**Fix**

When either date is patched, load existing event and validate the merged date pair.

---

### P1-5 — Access request approval lacks status transition guard

**Files/lines**

- `apps/api/src/modules/accessRequests/service.ts:43-75` — approval reads request, updates status, grants access.
- `apps/api/src/modules/accessRequests/service.ts:77-79` — reject directly updates status.
- `apps/api/src/modules/accessRequests/service.ts:108-141` — updateStatus does not check current status.

**Problem**

An already rejected or approved access request can be approved/rejected again. Maybe idempotency is desired, but then it must be explicit. Right now the state machine is not enforced.

**Fix**

Only `pending -> approved/rejected` should be allowed, or define idempotent behavior with explicit tests.

---

### P1-6 — Production config accepts weak placeholder values too easily outside production guard

**Files/lines**

- `apps/api/src/config.ts:41-44` — dev fallback values use local DB/auth and `replace_me` Google values.
- `apps/api/src/config.ts:71` — participant token secret falls back to `AUTH_SECRET`.
- `.env.example:20` — `COOKIE_DOMAIN=localhost`.
- `apps/api/src/auth/betterAuth.ts:27-35` — cross-domain cookies enabled when `cookieDomain` exists.

**Problem**

Production rejects missing values, but config does not reject weak placeholders if someone sets them. Local `.env.example` also sets `COOKIE_DOMAIN=localhost`, which is often a bad cookie-domain default. Also, participant-token secret falling back to auth secret is convenient but weaker separation.

**Fix**

- Add `validateProductionConfig(config)`.
- Reject `replace_me`, `localhost`, weak secrets, and short secrets in production.
- Prefer leaving `COOKIE_DOMAIN` empty locally.
- Require `PARTICIPANT_TOKEN_SECRET` in production.

---

### P1-7 — API/frontend contracts are duplicated manually

**Files/lines**

- `apps/api/src/modules/queue/service.ts:36-83` — public queue types.
- `apps/public-web/lib/apiClient.ts:35-72` — duplicated public queue types.
- `apps/dashboard-web/lib/apiClient.ts:29-158` — duplicated dashboard types.
- `apps/dashboard-web/lib/apiClient.ts:625-887` — manual runtime validators.

**Problem**

Manual duplicated contract types can drift. There are good runtime validators, but they are not generated or shared from one source of truth.

**Fix**

Add `packages/contracts` or `packages/shared/contracts` with DTO types and runtime validators, or derive schemas from API route schemas if you add JSON Schema/Zod/Valibot.

---

## P2 / cleanup and maintainability

### P2-1 — Legacy runtime still increases cognitive load

**Files/lines**

- `package.json:12,16,19-20` — legacy scripts remain.
- `apps/api/src/server.ts:1-570` — legacy `node:http` API remains.
- `apps/web/src/main.tsx:1-326` — legacy Vite app remains.
- `README.md:88` — states legacy remains as reference.

**Problem**

This is acceptable if intentionally retained, but it creates mental overhead and test surface. New Codex tasks may accidentally modify legacy code unless AGENTS is strict.

**Fix**

Create a `legacy-retirement` issue/ADR:

- keep for one milestone with clear owner/revisit date;
- move legacy tests to `tests/legacy` or remove after equivalent Fastify/Next coverage exists;
- eventually delete `apps/web` and `apps/api/src/server.ts`.

---

### P2-2 — Dashboard API client is too large

**Files/lines**

- `apps/dashboard-web/lib/apiClient.ts:1-887` — fetch helpers, types, validators, setup, events, queue actions all in one file.

**Problem**

This file is doing too many jobs. It is still manageable, but it is already over the “split before it becomes a trash bin” threshold.

**Fix**

Split into:

- `lib/api/base.ts`
- `lib/api/errors.ts`
- `lib/api/events.ts`
- `lib/api/queue.ts`
- `lib/api/setup.ts`
- `lib/api/validators.ts`
- `lib/api/types.ts` or shared contracts.

---

### P2-3 — Dead code / small cleanup

**Files/lines**

- `apps/dashboard-web/components/OperatorQueueView.tsx:536-543` — `formatDate` appears unused.
- `apps/api/src/routes/dashboard.ts:8-11`, `platform.ts:8-11`, `public.ts:7-10` — root routes throw `NOT_IMPLEMENTED`, despite subroutes existing.
- `apps/dashboard-web/.env.example:1-3` — duplicate `NEXT_PUBLIC_API_URL`.

**Fix**

- Remove unused function.
- Replace root `NOT_IMPLEMENTED` with route index/health-style response or remove if not needed.
- Deduplicate dashboard env example.

---

### P2-4 — Database enum-like text columns lack DB-level check constraints

**Files/lines**

- `packages/db/src/schema.ts:20-54` — enum-like allowed values exist in TypeScript arrays.
- `packages/db/src/schema.ts:138,149-150,164-165,198-199,248,354,388,406,432,451,468` — many status/role/type fields are plain `text`.

**Problem**

App code validates some routes, but DB does not enforce allowed enum-like values. Bad imports/manual SQL/bugs can write invalid statuses.

**Fix**

Add DB check constraints or Drizzle `pgEnum` strategy. If migrations are too invasive now, document and gradually add constraints.

---

## Positive findings

- `packages/db/src/schema.ts:257-259` protects against multiple active/paused events per venue.
- `packages/db/src/schema.ts:363-368` protects `now` and approved queue positions.
- `apps/api/src/modules/queue/service.ts:648-650` uses advisory transaction lock for per-event queue mutations.
- `apps/api/src/modules/queue/service.ts:638-645` uses two-phase negative positions to avoid unique conflicts during reorder.
- `apps/api/src/errors.ts:19-49` has a stable error envelope with request ID.
- `apps/api/src/plugins/cors.ts:5-21` uses allowlisted CORS with credentials, not wildcard credentials.
- `apps/api/src/modules/queue/participant.ts:26-37` uses httpOnly participant cookies and HMAC hashing server-side.
- `apps/api/src/modules/streams/eventStreams.ts:26-34` has heartbeat and cleanup for SSE.
- `docs/poza-nuta/adr/*` and `AGENTS.md` are now useful context for Codex.

---

# Recommended Codex backlog

## C0 — Baseline verification task

**Goal**: Establish current truth before changing code.

**Codex prompt**

> Read `AGENTS.md`, `docs/poza-nuta/00-supplement-index.md`, `docs/standards/15-definition-of-done-review-checklists.md`, and this audit. Do not change application behavior. Run the available checks: `pnpm install --frozen-lockfile`, `pnpm check:clean-package`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. If any command fails, report exact output and classify failures as dependency/environment/code. Do not fix unrelated failures in this PR.

**Acceptance**

- A short check report exists in the PR body.
- No application code changed.

---

## C1 — Replace CI example with real CI

**Priority**: P0

**Files**

- `.github/workflows/ci.example.yml`
- `.github/workflows/ci.yml`
- `.github/CODEOWNERS.template`
- `.github/CODEOWNERS`
- `package.json`

**Codex prompt**

> Implement real GitHub Actions CI for this pnpm monorepo. Use Node 24, corepack, pnpm 10.17.1, `pnpm install --frozen-lockfile`, and run clean package, lint, typecheck, test, build. Do not use npm. Rename or replace example/template files only if the repo has no real versions. Keep the workflow minimal and readable.

**Acceptance**

- `ci.yml` uses Node 24 and pnpm.
- No `npm ci` remains in active workflow.
- PR template references required checks.

---

## C2 — Harden public event-id routes

**Priority**: P0

**Files**

- `apps/api/src/modules/queue/routes.ts`
- `apps/api/src/modules/queue/service.ts`
- `apps/api/src/modules/events/service.ts`
- `tests/public-web.test.ts` or `tests/postgres-queue.test.ts`

**Codex prompt**

> Ensure direct public event UUID routes cannot expose queues or accept submissions for non-public venues. Prefer venue-slug routes as source of truth. Either remove direct event-id public route usage from web apps or enforce venue `status=active` and `verificationStatus=verified` before queue read, stream, and submission. Add regression tests for draft/unverified venue with active event.

**Acceptance**

- Non-public venue blocks `/public/events/:id/queue`, `/stream`, and `/requests`.
- Public visible venue happy path still passes.
- Error behavior is stable and documented.

---

## C3 — Replace platform-owner blanket event access with audited support access

**Priority**: P0/P1

**Files**

- `apps/api/src/permissions/service.ts`
- `packages/db/src/schema.ts` if adding audit table
- `apps/api/src/config.ts`
- `docs/poza-nuta/03-permission-model.md`
- tests in `tests/permissions.test.ts`

**Codex prompt**

> Replace implicit platform_owner event-scoped blanket access with explicit support access. Add config flag or explicit support permission. Add audit event/log for support access. Keep MVP behavior only in development/test if necessary. Update permission docs and tests.

**Acceptance**

- Production default does not silently grant blanket event operation to platform owner.
- Tests cover enabled and disabled support access.
- Docs state the policy.

---

## C4 — Map lifecycle unique conflicts to controlled 409

**Priority**: P1

**Files**

- `apps/api/src/modules/events/service.ts`
- `tests/events-lifecycle.test.ts`

**Codex prompt**

> In event lifecycle start/resume, map Postgres unique violation `events_one_active_or_paused_per_venue_unique` to `409 VENUE_HAS_ACTIVE_EVENT`, just like create-event already does. Add regression test for this mapping.

**Acceptance**

- Unique conflict during lifecycle does not become 500.
- Existing lifecycle tests pass.

---

## C5 — Validate merged event dates on patch

**Priority**: P1

**Files**

- `apps/api/src/modules/events/service.ts`
- `tests/events-lifecycle.test.ts` or dashboard API tests

**Codex prompt**

> Fix event patch date validation so patching only `startsAt` or only `endsAt` is validated against the existing stored counterpart. Add tests for both invalid partial patch directions.

**Acceptance**

- `endsAt <= existing startsAt` is rejected.
- `startsAt >= existing endsAt` is rejected.
- No-op patch behavior remains unchanged.

---

## C6 — Wire dashboard operator queue to SSE

**Priority**: P1

**Files**

- `apps/dashboard-web/components/OperatorQueueView.tsx`
- `apps/dashboard-web/lib/apiClient.ts`
- `apps/dashboard-web/lib/refetchScheduler.ts`
- `tests/dashboard-web.test.ts`
- `tests/sse.test.ts` if needed

**Codex prompt**

> Use the existing dashboard event stream endpoint in `OperatorQueueView`. Add `EventSource` with credentials, listen for queue/event events, coalesce refreshes through the scheduler, close on unmount, and keep interval polling as fallback only. Update UI label from manual refresh to live/fallback state.

**Acceptance**

- Operator queue refreshes on SSE event.
- EventSource is closed on unmount.
- Manual refresh still works.
- Tests cover stream-triggered refresh if feasible.

---

## C7 — Add production config validator

**Priority**: P1

**Files**

- `apps/api/src/config.ts`
- `.env.example`
- `apps/api/.env.example`
- tests for config parsing

**Codex prompt**

> Add production config validation. Reject placeholder secrets, short secrets, `replace_me`, `localhost` public URLs in production, and missing `PARTICIPANT_TOKEN_SECRET`. Do not break development defaults. Remove or comment out local `COOKIE_DOMAIN=localhost` from examples unless explicitly required.

**Acceptance**

- Production invalid env throws clear errors.
- Development defaults still work.
- Env examples are not misleading.

---

## C8 — Enforce access request state transitions

**Priority**: P1

**Files**

- `apps/api/src/modules/accessRequests/service.ts`
- tests for access request service/platform API

**Codex prompt**

> Make access request approval/rejection stateful. Only pending requests can transition to approved/rejected unless explicitly idempotent behavior is chosen and tested. Add tests for approving rejected and rejecting approved requests.

**Acceptance**

- Invalid transitions return controlled 409.
- Idempotency behavior, if chosen, is documented and tested.

---

## C9 — Start contract consolidation

**Priority**: P2/P1 depending on pace

**Files**

- new `packages/contracts` or `packages/shared/src/contracts/*`
- `apps/api/src/modules/*`
- `apps/public-web/lib/*`
- `apps/dashboard-web/lib/*`

**Codex prompt**

> Introduce a small shared contracts package for public queue and dashboard event DTOs. Move types and runtime validators from duplicated frontend files into shared contracts without changing API payload shape. Keep the PR small: start with public queue only.

**Acceptance**

- Public queue DTO has one source of truth.
- Public-web imports shared validator/type.
- API response shape tests still pass.

---

## C10 — Legacy retirement plan

**Priority**: P2

**Files**

- `docs/poza-nuta/*`
- `README.md`
- `package.json`
- `apps/web/*`
- `apps/api/src/server.ts`
- tests

**Codex prompt**

> Create a legacy retirement ADR for `apps/web` and `apps/api/src/server.ts`. Do not delete them yet. Identify which tests cover legacy behavior and which equivalent target-architecture tests must exist before deletion.

**Acceptance**

- ADR names owner, revisit trigger, deletion criteria.
- README clearly separates target architecture from legacy reference.

---

# Suggested execution order for Codex

1. C0 — baseline checks.
2. C1 — real CI.
3. C2 — public event-id visibility hardening.
4. C4 — lifecycle conflict mapping.
5. C5 — patch date validation.
6. C8 — access request transitions.
7. C6 — dashboard SSE.
8. C7 — production config validation.
9. C3 — audited support access.
10. C9 — contracts consolidation.
11. C10 — legacy retirement ADR.

Do not bundle these into one mega-PR. That would be garbage. Each item should be a small PR with tests.
