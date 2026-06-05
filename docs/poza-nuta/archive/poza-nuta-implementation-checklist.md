# Poza Nutą — Implementation Checklist

> Zaktualizowane po audycie liniowym aktualnego ZIP-a z 2026-05-29.
> Ten dokument zastępuje starą checklistę statusów. Nie wszystkie stare `TODO` są nadal aktualne.

## Status faz

| Etap | Status | Uwagi |
|---|---:|---|
| Phase 0 — ADRs | DONE | ADR-y istnieją. |
| Phase 1 — Monorepo foundation | DONE | pnpm workspace, Biome, tsconfig, scaffoldy. |
| Phase 2 — Docker local infra | PARTIAL | Docker Compose Postgres działa; API/worker Dockerfile nadal TODO. |
| Phase 3 — Drizzle/Postgres schema | DONE | Schema, migracje, seed źródeł katalogu i lokalny seed demo QA. |
| Phase 4 — Fastify API skeleton | DONE | Fastify, health, CORS, cookies, rate limit, error handler, smoke. |
| Phase 5 — Better Auth + Google | DONE | Foundation, `/me`, platform owner bootstrap. |
| Phase 6 — Permission layer | DONE | Centralny permission layer i testy. |
| Phase 7 — Organizations + venues | DONE | Backend foundation i platform access requests. |
| Phase 8 — Events lifecycle | DONE | Event lifecycle, staff, active-event lookup. |
| Phase 9 — Queue in Postgres | DONE | Public/operator queue, transactions, `queue_events`. |
| Phase 10 — SSE | DONE | Public/dashboard streams, in-memory bus. |
| Phase 11 — Public web | DONE/PARTIAL | Public MVP działa; hardening P0/P1 wymagany. |
| Phase 12 — Dashboard web | PARTIAL | D1 shell foundation, D2 operator queue MVP, D3 event selection MVP, D4 event lifecycle controls, D4.5 request status propagation i D5 minimal event creation działają; pełny CRUD/platform UI nadal TODO. |
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

- [x] Dodać partial unique index dla approved positions:

```sql
unique (event_id, position) where status = 'approved' and position is not null
```

- [x] Dodać explicit event queue lock per transaction.
- [x] Serializować mutacje kolejki per event przez `pg_advisory_xact_lock`.
- [x] Mapować unique violation na `409 CONFLICT`.
- [x] Dodać testy approve/move/position consistency.

Kryterium gotowości:

- [x] Nie da się uzyskać dwóch approved requestów z tą samą pozycją w jednym evencie.
- [x] Approved queue jest normalizowana do pozycji `1..n` po approve/reject/start/skip/move.

### Local QA demo data — DEV TOOL

- [x] Dodać `pnpm db:seed:demo`.
- [x] Seed tworzy idempotentnie organizację `poza-nuta-demo`.
- [x] Seed tworzy publicznie widoczny lokal `demo-klub` (`active` + `verified`).
- [x] Seed tworzy aktywny event `demo-karaoke` z `public_join_enabled=true` i `public_queue_enabled=true`.
- [x] Seed tworzy przykładową kolejkę: `now`, dwa `approved`, `pending` i opcjonalny `done`.

Kryterium gotowości:

- [x] QA może wejść na `http://localhost:3000/demo-klub`, `/join` i `/queue` po `pnpm db:seed:demo`.

### SSE CORS for public queue stream — BUGFIX

- [x] Publiczne SSE streamy zwracają CORS headers dla allowlistowanych originów.
- [x] `GET /public/venues/:venueSlug/stream` działa z `http://localhost:3000`.
- [x] `GET /public/events/:eventPublicId/stream` działa z `http://localhost:3000`.
- [x] Dashboard stream działa z `DASHBOARD_WEB_URL`.
- [x] Unsupported origin nie dostaje `Access-Control-Allow-Origin`.

Kryterium gotowości:

- [x] Browser EventSource z public-web nie dostaje błędu `No 'Access-Control-Allow-Origin' header`.

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

## Phase 12 — Dashboard web MVP — PARTIAL

### Zakres minimalny

- [x] Next.js App Router w `apps/dashboard-web`.
- [x] `/sign-in` jako normalny login flow.
- [x] `/login` jako kompatybilny alias do `/sign-in`.
- [x] `/dashboard/access` jako D1 access state.
- [x] `/dashboard/organizations` placeholder.
- [x] `/dashboard/venues` placeholder.
- [x] `/dashboard/events` D3 event selection MVP.
- [x] `/dashboard/events/new` D5 minimal event creation.
- [x] Manual eventId entry zostaje tylko jako fallback QA/dev.
- [x] `/dashboard/events/[eventId]/queue` operator queue MVP + D4 event lifecycle controls.
- [ ] `/platform/access-requests`.
- [ ] `/platform/organizations`.
- [ ] `/platform/venues`.
- [ ] `/platform/catalog` placeholder.

### Auth

- [x] Login button kieruje do Better Auth route w Fastify API.
- [x] Nie używać NextAuth.
- [x] Nie używać Supabase Auth.
- [x] Fetch z `credentials: include`.
- [x] `/me` bootstrap rozróżnia:
  - [x] unauthenticated,
  - [x] access pending,
  - [x] dashboard allowed.
- [x] `/setup` pozwala jednorazowo nadać pierwszego `platform_owner` przez `PLATFORM_SETUP_TOKEN`.
- [x] `GET /setup/status` nie leakuję userów ani emaili, zwraca tylko `setupRequired`.
- [x] `POST /setup/claim-platform-owner` wymaga zalogowanej sesji Better Auth i tokena.
- [x] Login z `/setup` wraca po Google OAuth do `/setup`, a nie do `/dashboard`.
- [x] `setupRequired=true` kieruje `/dashboard/*` do `/setup`.
- [x] `setupRequired=false` sprawia, ze `/setup` redirectuje do `/dashboard`, `/sign-in` albo `/dashboard/access` i nie pokazuje token form.
- [x] Pending approval / closed beta pokazuje się tylko po `setupRequired=false`.
- [x] API/setup status unavailable pokazuje stan unavailable, a nie fałszywy setup-required.
- [x] `BOOTSTRAP_PLATFORM_OWNER_EMAIL` zostaje oznaczony jako legacy/dev fallback.

### D1 foundation — DONE

- [x] Root `dev:dashboard` uruchamia `apps/dashboard-web` na `127.0.0.1:3001`.
- [x] Root `build:dashboard` buduje dashboard.
- [x] Root `typecheck` obejmuje `apps/dashboard-web`.
- [x] Dashboard komunikuje się tylko z Fastify API przez `NEXT_PUBLIC_API_URL`.
- [x] `GET /me` jest wywoływane z `credentials: include`.
- [x] Better Auth Google CTA używa client-side `authClient.signIn.social({ provider: "google" })`.
- [x] D1 nie implementuje jeszcze operator queue actions ani CRUD.

### Operator queue

- [x] `/dashboard/events` pobiera `GET /dashboard/events` i pokazuje operatorowi dostepne eventy.
- [x] Eventy sa grupowane w `Aktywne teraz`, `Nadchodzace / robocze` i `Zakonczone`.
- [x] Eventy `active` i `paused` sa wyroznione jako glowne operacyjne wejscie do kolejki.
- [x] Operator nie musi znac event UUID jako glownego flow; `Otworz kolejke` prowadzi do `/dashboard/events/:eventId/queue`.
- [x] Manualne otwieranie po ID jest opisane jako awaryjny fallback QA/dev.
- [x] Pobiera `GET /dashboard/events/:eventId/operator-queue`.
- [x] Pokazuje pending/approved/now/done/rejected/skipped.
- [x] Obsługuje approve/reject/start/done/skip/move.
- [x] Nie uzywa dashboard SSE jako krytycznego kanalu dla operator actions.
- [x] Po mutacjach robi deterministyczny refetch event detail + operator queue.
- [x] Nie uzywa polling jako glownego mechanizmu dla operator queue actions.
- [x] `401` pokazuje login CTA, `403` pokazuje brak uprawnień, `409` pokazuje konflikt kolejki.
- [x] Dashboard queue page komunikuje się wyłącznie z Fastify API i używa `credentials: include`.

- [x] MVP support access: aktywny `platform_owner` moze obslugiwac dowolna operator queue i dashboard event stream. Docelowo rozdzielic na audytowany support access albo impersonation.

### Event lifecycle controls

- [x] `/dashboard/events/:eventId/queue` pobiera `GET /dashboard/events/:eventId` dla statusu eventu.
- [x] UI pokazuje panel `Wydarzenie` ze statusem, lokalem oraz flagami public join/queue.
- [x] Lifecycle actions uzywaja istniejacych endpointow `POST /dashboard/events/:eventId/start|pause|resume|close|archive|cancel`.
- [x] Dostepne akcje sa modelowane centralnie: `draft/scheduled -> start,cancel`, `active -> pause,close`, `paused -> resume,close`, `closed/cancelled -> archive`, `archived -> brak akcji`.
- [x] Public join/queue flag controls uzywaja `PATCH /dashboard/events/:eventId`.
- [x] Po lifecycle action albo flag update UI robi deterministyczny refetch eventu i operator queue.
- [x] `403` i `409` sa mapowane na czytelne stany UI.

### D4.1 lifecycle realtime coverage

- [x] `/[venueSlug]/join` uzywa venue-first SSE `GET /public/venues/:venueSlug/stream`.
- [x] Public join refetchuje active-event state po `event.started`, `event.paused`, `event.resumed`, `event.closed`, `event.archived`, `event.cancelled` i `queue.updated`.
- [x] Pause/resume eventu blokuje albo przywraca public join form bez F5.
- [x] `/dashboard/events` ma bezpieczny fallback refresh po focus/visibility.
- [x] EventSource error jest stanem nie-fatalnym i nie crashuje UI.

### D4.2/P0 SSE connection starvation and hanging mutation fix

- [x] Operator queue page nie uzywa dashboard SSE jako krytycznego kanalu dla lifecycle controls.
- [x] Mutacje lifecycle/flags/queue maja AbortController timeout i czytelny timeout error.
- [x] Pending action jest czyszczony w `finally` po sukcesie, bledzie i timeout.
- [x] Public join i public queue utrzymuja maksymalnie jeden venue stream dla `venueSlug`.
- [x] `/dashboard/events` nie otwiera streamow per event w krytycznym flow; uzywa refreshu po focus/visibility.
- [x] Lifecycle mutation nie czeka na SSE: wykonuje POST/PATCH, potem deterministyczny refetch event detail + operator queue.

### D4.4 safe refresh UX for dashboard events

- [x] `/dashboard/events` nie tworzy EventSource per event.
- [x] Ma reczny przycisk `Odswiez`.
- [x] Pokazuje timestamp ostatniego odswiezenia.
- [x] Polling dziala co 15 sekund tylko gdy karta jest widoczna.
- [x] Focus/visibility refresh uzywa in-flight guardu.
- [x] Blad refreshu jest non-fatal i zostawia poprzednia liste widoczna.
- [ ] RT1: rozwazyc pojedynczy `/dashboard/events/stream` albo `/dashboard/stream` zamiast streamow per event.

### D4.5 request status propagation

- [x] `/dashboard/events/:eventId/queue` ma reczny przycisk `Odswiez kolejke`.
- [x] Operator queue robi safe refresh co 5 sekund tylko dla widocznej karty.
- [x] Operator queue odswieza sie po focus/visibility i uzywa in-flight guardu.
- [x] Auto-refresh operator queue nie startuje, gdy trwa mutation pending.
- [x] Failed refresh operator queue jest non-fatal i zostawia poprzedni snapshot widoczny.
- [x] Dodano `GET /public/venues/:venueSlug/my-requests`.
- [x] `my-requests` uzywa cookie `pn_participant`, filtruje po hashu tokena i nie przyjmuje tokena w query/body.
- [x] Public join sledzi wlasny request po submit i mapuje statusy `pending`, `approved`, `now`, `done`, `rejected`, `skipped` na komunikaty uczestnika.
- [x] Public join uzywa safe polling/focus refresh jako stabilnego fallbacku po problemach z nadmiarowym SSE.

### D5 minimal event creation

- [x] `/dashboard/events` ma akcje `Nowe wydarzenie`.
- [x] `/dashboard/events/new` pobiera `GET /dashboard/venues`.
- [x] Formularz tworzenia ma lokal, nazwe, slug, status `draft|scheduled|active`, opcjonalne daty oraz `publicJoinEnabled`/`publicQueueEnabled`.
- [x] `createDashboardEvent` uzywa `POST /dashboard/events`, `credentials: include` i timeoutu mutacji.
- [x] Po sukcesie dashboard redirectuje do `/dashboard/events/:eventId/queue`.
- [x] `POST /dashboard/events` zwraca event z kontekstem `venue` i `operatedByOrganization`.
- [x] `platform_owner` moze tworzyc event jako MVP support/admin.
- [x] Duplicate slug jest mapowany na kontrolowany `409 EVENT_SLUG_CONFLICT`.
- [ ] Pelny CRUD eventow/lokali/organizacji.
- [ ] Staff assignment UI.
- [ ] Tworzenie venue z dashboardu.

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
- [x] Operator queue MVP exists in dashboard-web.

Conclusion: backend milestone is mostly achieved; product milestone needs dashboard-web.

## Typecheck integrity cleanup

- [x] Root `pnpm typecheck` uruchamia realne `tsc --noEmit` dla `packages/domain`, `packages/db`, `apps/api`, `packages/shared`, `apps/public-web` i `tsconfig.tests.json`.
- [x] `scripts/typecheck.mjs` zostaje jako `pnpm check:architecture`, czyli dodatkowy custom check repo, a nie jedyny typecheck.
- [x] Domyślne `pnpm dev` uruchamia target architecture: Fastify API + Next.js public-web.
- [x] Domyślne `pnpm build` buduje target public-web.
- [x] Legacy Vite/API scripts są jawnie nazwane `dev:web:legacy`, `build:web:legacy`, `dev:api:legacy`.
- [x] Naprawiono wskazane błędy TS: permissions `.includes()`, TCP server address narrowing, `EventSummary` date normalization i headers typing.
