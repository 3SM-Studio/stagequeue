# Poza Nutą — Implementation Checklist

> Zaktualizowane po audycie liniowym aktualnego ZIP-a z 2026-05-29.
> Ten dokument zastępuje starą checklistę statusów. Nie wszystkie stare `TODO` są nadal aktualne.

## Status faz

| Etap | Status | Uwagi |
|---|---:|---|
| Phase 0 — ADRs | DONE | ADR-y istnieją. |
| Phase 1 — Monorepo foundation | DONE | pnpm workspace, Biome, tsconfig, scaffoldy. |
| Phase 2 — Docker local infra | PARTIAL | Docker Compose Postgres działa; API/worker Dockerfile nadal TODO. |
| Phase 3 — Drizzle/Postgres schema | DONE | Schema, migracje, seed źródeł katalogu. |
| Phase 4 — Fastify API skeleton | DONE | Fastify, health, CORS, cookies, rate limit, error handler, smoke. |
| Phase 5 — Better Auth + Google | DONE | Foundation, `/me`, platform owner bootstrap. |
| Phase 6 — Permission layer | DONE | Centralny permission layer i testy. |
| Phase 7 — Organizations + venues | DONE | Backend foundation i platform access requests. |
| Phase 8 — Events lifecycle | DONE | Event lifecycle, staff, active-event lookup. |
| Phase 9 — Queue in Postgres | DONE | Public/operator queue, transactions, `queue_events`. |
| Phase 10 — SSE | DONE | Public/dashboard streams, in-memory bus. |
| Phase 11 — Public web | DONE/PARTIAL | Public MVP działa; hardening P0/P1 wymagany. |
| Phase 12 — Dashboard web | TODO | Nie zaczynać przed H1-H3 minimum. |
| Phase 13 — Global catalog runtime | TODO | Import iSing/KaraFun do DB, jobs, logs. |
| Phase 14 — Stats | TODO | Liczyć z `queue_events`. |
| Phase 15 — CI/CD | TODO | GitHub Actions, Vercel/Railway/Supabase. |
| Phase 16 — Security hardening | TODO/PARTIAL | Część istnieje, reszta w H-list poniżej. |

## H-list — obowiązkowy hardening przed dalszym dużym UI

### H1 — Source/package hygiene — P0

- [x] Usunąć `.env` z paczek/source ZIP.
- [x] Usunąć `apps/public-web/node_modules` z paczek/source ZIP.
- [x] Usunąć `.next`, `.next-build`, `.next-public`, `dist`, `coverage`, `.turbo` z paczek/source ZIP.
- [x] Dodać `scripts/check-clean-package.mjs`.
- [x] Dodać `pnpm check:clean-package`.
- [x] Dodać `pnpm pack:source` oparte o `git archive` albo jawne excludes.
- [ ] Podpiąć check do CI.

Kryterium gotowości:

- [x] `pnpm check:clean-package` failuje, jeśli znajdzie generated artifacts.
- [x] Nowy ZIP źródłowy nie zawiera `.env`, `node_modules`, `.next*`, `dist`.

### H2 — Event staff assignment security — P0

- [x] Zmienić service signatures:
  - [x] `patchStaffAssignment(eventId, assignmentId, input)`
  - [x] `removeStaffAssignment(eventId, assignmentId)`
- [x] UPDATE musi robić `WHERE id = assignmentId AND event_id = eventId`.
- [x] DELETE/soft delete musi robić `WHERE id = assignmentId AND event_id = eventId`.
- [x] Dodać test: user z `event.manage` eventu A nie może zmienić assignmentu eventu B.
- [x] Dodać test: poprawny eventId + assignmentId działa.

Kryterium gotowości:

- [x] Nie da się zmienić staff assignmentu spoza eventu z URL.

### H3 — Invalid role defaults migration — P0

- [x] Zmienić `venue_organization_access.role` default:
  - [x] z `operator`
  - [x] na `karaoke_operator` albo brak defaultu.
- [x] Zmienić `event_staff_assignments.role` default:
  - [x] z `operator`
  - [x] na `queue_operator` albo brak defaultu.
- [x] Dodać migrację.
- [x] Dodać test, że defaulty są zgodne z permission role definitions.

Kryterium gotowości:

- [x] DB nie tworzy ról, których permission layer nie zna.

### H4 — Venue-first public queue endpoints — P1

- [x] Dodać `GET /public/venues/:venueSlug/queue`.
- [x] Dodać `POST /public/venues/:venueSlug/requests`.
- [x] Dodać `GET /public/venues/:venueSlug/stream`.
- [x] Endpointy rozwiązują `venueSlug -> active/paused event` po stronie API.
- [x] Public-web przechodzi z event UUID endpoints na venueSlug endpoints.
- [x] Event UUID endpoints oznaczyć jako temporary/deprecated public API albo internal compatibility.
- [x] Dodać testy dla venueSlug queue/request/stream.

Kryterium gotowości:

- [x] Public-web nie musi znać event UUID dla podstawowego join/queue flow.

### H5 — Participant anti-spam foundation — P1

- [x] Dodać participant cookie/token dla public-web.
- [x] Hash tokena zapisywać w `song_requests.participant_token_hash`.
- [x] Dodać max pending requests per participant/event.
- [x] Dodać max submissions per participant/event/time window.
- [x] Zostawić IP+event rate limit jako fallback.
- [x] Dodać testy.

Kryterium gotowości:

- [x] Public submit nie opiera się wyłącznie na IP rate limit.

### H6 — Queue concurrency hardening — P1

- [ ] Dodać partial unique index dla approved positions:

```sql
unique (event_id, position) where status = 'approved'
```

- [ ] Albo dodać explicit event queue lock per transaction.
- [ ] Mapować unique violation na `409 CONFLICT`.
- [ ] Dodać testy approve/move/position consistency.

Kryterium gotowości:

- [ ] Nie da się uzyskać dwóch approved requestów z tą samą pozycją w jednym evencie.

### H7 — DB status/role constraints — P1/P2

- [ ] Dodać check constraints albo pg enums dla:
  - [ ] `users.status`
  - [ ] `platform_memberships.role/status`
  - [ ] `organizations.type/status`
  - [ ] `organization_memberships.role/status`
  - [ ] `venues.status/verification_status`
  - [ ] `venue_organization_access.role/status`
  - [ ] `events.status`
  - [ ] `event_staff_assignments.role/status`
  - [ ] `song_requests.status`
  - [ ] `queue_events.type/actor_kind`
  - [ ] `catalog_import_runs.status`
- [ ] Dodać testy/migracje.

Kryterium gotowości:

- [ ] DB odrzuca nieznane statusy i role.

## Phase 12 — Dashboard web MVP — TODO after H1-H3 minimum

### Zakres minimalny

- [ ] Next.js App Router w `apps/dashboard-web`.
- [ ] `/login`.
- [ ] `/access-pending`.
- [ ] `/organizations`.
- [ ] `/venues`.
- [ ] `/events/[eventId]/operator`.
- [ ] `/platform/access-requests`.
- [ ] `/platform/organizations`.
- [ ] `/platform/venues`.
- [ ] `/platform/catalog` placeholder.

### Auth

- [ ] Login button kieruje do Better Auth route w Fastify API.
- [ ] Nie używać NextAuth.
- [ ] Nie używać Supabase Auth.
- [ ] Fetch z `credentials: include`.
- [ ] `/me` bootstrap rozróżnia:
  - [ ] unauthenticated,
  - [ ] access pending,
  - [ ] dashboard allowed.

### Operator queue

- [ ] Pobiera `GET /dashboard/events/:eventId/operator-queue`.
- [ ] Pokazuje pending/approved/now/done/rejected/skipped.
- [ ] Obsługuje approve/reject/start/done/skip/move.
- [ ] Podłącza `GET /dashboard/events/:eventId/stream`.
- [ ] Po `queue.updated`, `request.*`, `event.*` robi refetch.
- [ ] Nie używać polling jako głównego mechanizmu.

### Platform minimal

- [ ] `GET /platform/access-requests`.
- [ ] approve/reject.
- [ ] list organizations.
- [ ] list venues.

### Zakazy

- [ ] Nie dodawać shadcn.
- [ ] Nie dodawać ciężkiego design systemu.
- [ ] Nie dodawać billing.
- [ ] Nie dodawać marketplace.
- [ ] Nie dodawać email invitations.
- [ ] Nie dodawać WebSocket.
- [ ] Nie dodawać Redis/BullMQ.

## Phase 13 — Global catalog runtime — TODO

- [ ] Przenieść iSing importer z JSON do DB.
- [ ] Dodać worker job dla importu.
- [ ] Dodać import run lifecycle.
- [ ] Dodać import logs.
- [ ] Dodać counters inserted/updated/unchanged/unavailable/errors.
- [ ] Dodać search API po `song_source_tracks`.
- [ ] Public join ma używać search + track select zamiast manual title/artist.
- [ ] KaraFun adapter interface/stub.

## Phase 14 — Stats — TODO

- [ ] Liczyć tylko z `queue_events`.
- [ ] Event summary.
- [ ] Venue history.
- [ ] Organization history.
- [ ] Host/operator activity.
- [ ] Top songs/artists.
- [ ] Avg wait time.

## Phase 15 — CI/CD — TODO

- [ ] GitHub Actions.
- [ ] `pnpm install --frozen-lockfile`.
- [ ] `pnpm check:clean-package`.
- [ ] `pnpm lint`.
- [ ] `pnpm typecheck`.
- [ ] `pnpm test`.
- [ ] `pnpm build:public`.
- [ ] `pnpm build:dashboard`.
- [ ] API build.
- [ ] Migration validation.
- [ ] Vercel projects.
- [ ] Railway API/worker services.
- [ ] Supabase env docs.

## Phase 16 — Security hardening — TODO/PARTIAL

- [ ] Participant anti-spam.
- [ ] Strong public submit abuse controls.
- [ ] API body limits already exist; verify route-specific limits.
- [ ] No secrets in frontend.
- [ ] No localStorage auth tokens.
- [ ] Secure error messages.
- [ ] Structured logs without secret/body dumps.
- [ ] DB backup/restore runbook.
- [ ] Better Auth redirect URI production checklist.
- [ ] CORS production allowlist verified.

## Current first real platform milestone status

Milestone items:

- [x] Postgres schema exists.
- [x] Google login foundation exists.
- [x] Platform owner bootstrap exists.
- [x] Organization exists.
- [x] Venue exists.
- [x] Organization venue access exists.
- [x] Event can be created and started.
- [x] Active event exposes public join/queue through active event lookup.
- [x] Participant can submit song through public-web manual form.
- [x] Operator API can approve/start/done.
- [x] Queue operations are stored in Postgres.
- [x] `queue_events` records history.
- [x] Public view updates via SSE.
- [ ] Operator UI exists in dashboard-web.

Conclusion: backend milestone is mostly achieved; product milestone needs dashboard-web.
