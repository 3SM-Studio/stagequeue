# Poza Nutą — Codex Architecture Brief

> Źródło prawdy po audycie liniowym aktualnego ZIP-a z 2026-05-29.
> Ten dokument aktualizuje pierwotny brief po wykonaniu Phase 0–11 i dodaje obowiązkowy hardening przed dalszym UI.

## 1. Kierunek produktu — bez zmian

Poza Nutą pozostaje **venue-first karaoke operations platform**.

Nie budujemy prostej aplikacji kolejki. Budujemy platformę, w której:

- lokal jest stabilnym publicznym centrum produktu,
- organizacja może mieć dostęp do lokalu,
- użytkownik jest członkiem organizacji,
- event odbywa się w lokalu i jest prowadzony przez organizację,
- konkretna osoba jest przypisana do eventu jako prowadzący/operator,
- aktywna kolejka istnieje dopiero po starcie eventu,
- uczestnik nie zakłada konta,
- dashboard/operator wymaga Google OAuth,
- katalog iSing/KaraFun jest globalnym zasobem platformy.

Publiczne URL-e docelowe:

```txt
poza-nuta.pl/:venueSlug
poza-nuta.pl/:venueSlug/join
poza-nuta.pl/:venueSlug/queue
```

Dashboard:

```txt
dashboard.poza-nuta.pl
```

API:

```txt
api.poza-nuta.pl
```

## 2. Aktualny stan po audycie

Wykonane i zwalidowane według raportów projektu:

- ADR-y i pnpm monorepo.
- Docker Compose z lokalnym Postgres.
- Drizzle schema + migracje.
- Fastify API skeleton.
- Better Auth + Google OAuth foundation.
- `/me` i domenowy user mapping.
- `platform_memberships` bez `isAdmin`.
- centralny permission layer.
- organizations/venues backend foundation.
- events lifecycle.
- event staff assignments.
- queue flow w Postgresie.
- `queue_events` jako audit/source dla statystyk.
- SSE dla event/queue streams.
- Next.js `apps/public-web` MVP.
- Next.js `apps/dashboard-web` D1 foundation + D2 operator queue MVP.
- Local QA seed `pnpm db:seed:demo` dla public-web happy path.

Aktualna liczba testów raportowana przez Codex po D2 operator queue MVP: `220/220`.

## 3. Co nadal nie jest gotowe

Nie gotowe:

- pełny dashboard CRUD/platform admin w `apps/dashboard-web`.
- catalog import runtime i worker.
- katalog search w public join.
- stats dashboard.
- CI/CD i deployment.
- API/worker Dockerfile.
- DB check constraints dla statusów/ról.

## 4. Stack — bez zmian

```txt
public-web:      Next.js -> Vercel
app dashboard:   Next.js -> Vercel
api:             Fastify -> Railway
worker:          Node.js worker -> Railway
database:        PostgreSQL -> Supabase Postgres
ORM/migrations:  Drizzle
auth:            Better Auth in Fastify API
login:           Google OAuth only
realtime:        SSE first
jobs:            Postgres-backed jobs first
tooling:         pnpm + Biome + TypeScript
local infra:     Docker Compose
```

Zakazy nadal obowiązują:

- nie wracać do JSON queue storage,
- nie używać SQLite produkcyjnie,
- nie przenosić backendu do Next route handlers,
- nie używać Supabase Auth na start,
- nie dodawać WebSocket/Redis/BullMQ bez potrzeby,
- nie budować własnego auth od zera.

## 5. Krytyczne korekty po audycie liniowym

### P0 — source/package hygiene

Aktualny ZIP zawiera `.env`, `apps/public-web/node_modules`, `.next*`, `.next-build`, `.next-public` i `dist`.

To musi zostać naprawione przed kolejnym audytem/deploymentem.

Wymagane:

```txt
scripts/check-clean-package.mjs
pnpm check:clean-package
pnpm pack:source
```

`pack:source` ma używać `git archive` albo jawnych exclude rules. Nie wolno wysyłać ZIP-a z katalogu roboczego.

### P0 — event staff assignment security

`PATCH/DELETE /dashboard/events/:eventId/staff/:assignmentId` musi weryfikować, że assignment należy do `eventId` z URL.

Wymagane:

```txt
patchStaffAssignment(eventId, assignmentId, input)
removeStaffAssignment(eventId, assignmentId)
WHERE id = assignmentId AND event_id = eventId
```

Dodać test regresji.

### P0 — invalid role defaults

W DB schema są niespójne defaulty:

```txt
venue_organization_access.role default "operator" -> invalid
event_staff_assignments.role default "operator" -> invalid
```

Wymagane:

```txt
venue_organization_access.role default "karaoke_operator" albo brak defaultu
event_staff_assignments.role default "queue_operator" albo brak defaultu
```

Dodać migrację.

### P1 — public queue endpoint po venueSlug — DONE

Public-web nie musi już robić podstawowego join/queue flow przez:

```txt
venueSlug -> activeEvent.id -> /public/events/:eventPublicId/queue
```

Preferowane publiczne API dla uczestnika to teraz venue-first:

```txt
GET  /public/venues/:venueSlug/queue
POST /public/venues/:venueSlug/requests
GET  /public/venues/:venueSlug/stream
```

Event UUID endpoints zostają tymczasowo jako event-specific compatibility API. Venue page może nadal używać `GET /public/venues/:venueSlug/active-event` do profilu/inactive state, ale join, queue snapshot i stream działają po `venueSlug`.

### P1 — participant anti-spam

DONE: public submit używa anonimowego participant cookie `pn_participant`, a DB przechowuje tylko HMAC-SHA-256 hash w `song_requests.participant_token_hash`.

Aktualna polityka MVP:

- cookie jest HttpOnly, SameSite=Lax, Secure w produkcji, `path=/`,
- hash używa `PARTICIPANT_TOKEN_SECRET`, z fallbackiem do `AUTH_SECRET`,
- max `PUBLIC_REQUEST_MAX_ACTIVE_PER_PARTICIPANT=3` dla statusów `pending`, `approved`, `now`,
- cooldown `PUBLIC_REQUEST_COOLDOWN_SECONDS=20`,
- IP+event rate limit zostaje fallbackiem.

### P1 — queue concurrency

DONE: queue mutations są utwardzone przeciw race conditions.

Zastosowane zabezpieczenia:

- partial unique index `song_requests_one_approved_position_per_event_unique` dla `(event_id, position)` przy `status='approved' and position is not null`,
- `pg_advisory_xact_lock` per event na początku mutacji kolejki w transakcji,
- mapowanie unique violation na kontrolowane `409 CONFLICT`,
- normalizacja approved queue do pozycji `1..n` po approve/reject/start/skip/move.

### DEV — local QA demo data

DONE: `pnpm db:seed:demo` przygotowuje lokalne dane do recznego smoke testu public-web:

- organizacja `poza-nuta-demo`,
- publicznie widoczny lokal `demo-klub`,
- aktywny event `demo-karaoke`,
- przykładowe requesty w statusach `now`, `approved`, `pending` i `done`.

Seed jest idempotentny i nie tworzy prawdziwych userów auth ani sekretów. Po `docker compose up -d`,
`pnpm db:migrate`, `pnpm db:seed:catalog` i `pnpm db:seed:demo` QA moze sprawdzic:

```txt
http://localhost:3000/demo-klub
http://localhost:3000/demo-klub/join
http://localhost:3000/demo-klub/queue
```

### P1 — DB constraints dla statusów/ról

Statusy i role są teraz `text`. Przed produkcją dodać check constraints albo pg enums.

## 6. Zaktualizowana kolejność prac

Nie iść od razu w pełny dashboard bez hardeningu.

Obowiązkowa kolejność od teraz:

```txt
H1 source/package hygiene
H2 event staff assignment security fix
H3 invalid role defaults migration
H4 venue-first public queue endpoints
H5 participant token / anti-spam foundation
H6 queue concurrency hardening
Phase 12 dashboard-web D1/D2 foundation
Phase 13 global catalog runtime
Phase 14 stats
Phase 15 CI/CD deployment
Phase 16 security hardening pass
```

H1-H6 zostały zamknięte w hardening patchach: source package hygiene, event staff assignment guard po `eventId`, spójne defaulty ról DB z permission model, venue-first public queue endpoints, participant token/anti-spam foundation oraz queue concurrency hardening.

Phase 12 D1/D2 jest rozpoczęte: `apps/dashboard-web` jest realną aplikacją Next.js App Router na `localhost:3001`, komunikuje się wyłącznie z Fastify API, używa `GET /me` z `credentials: include` i ma shell stanów `unauthenticated`, `access pending` oraz `dashboard allowed`. D2 dodaje pierwszy operator queue MVP pod `/dashboard/events/[eventId]/queue`.

## 7. Dashboard-web scope po hardeningu

Dashboard D1 foundation zawiera:

- `/login`,
- `/dashboard`,
- `/dashboard/access`,
- `/dashboard/organizations` placeholder,
- `/dashboard/venues` placeholder,
- `/dashboard/events` placeholder,
- Better Auth Google CTA przez client-side `authClient.signIn.social({ provider: "google" })`,
- `GET /me` jako źródło prawdy dla dostępu.

Dashboard D2 operator queue MVP zawiera:

- `/dashboard/events` z manualnym wejściem po eventId,
- `/dashboard/events/[eventId]/queue`,
- `GET /dashboard/events/:eventId/operator-queue`,
- akcje approve/reject/start/done/skip/move przez istniejące Fastify endpointy,
- SSE `GET /dashboard/events/:eventId/stream` i refetch po `queue.updated`, `request.*` oraz `event.*`,
- obsługę `401`, `403`, `409` bez obchodzenia permission layera.

## 7a. Platform setup / first owner

`BOOTSTRAP_PLATFORM_OWNER_EMAIL` zostaje tylko jako legacy/dev fallback. Produkcyjny target pierwszego ownera platformy to:

```txt
PLATFORM_SETUP_TOKEN + dashboard /setup + API /setup/claim-platform-owner
```

Reguły:

- `GET /setup/status` zwraca tylko `setupRequired: true|false`.
- `setupRequired=true` tylko gdy nie istnieje aktywny `platform_owner` w `platform_memberships`.
- `POST /setup/claim-platform-owner` wymaga zalogowanej sesji Better Auth i poprawnego `PLATFORM_SETUP_TOKEN`.
- Claim aktywuje domenowego usera i zapisuje `platform_owner` w `platform_memberships`.
- Po pierwszym aktywnym ownerze setup jest zamknięty i kolejne claimy zwracają `409 SETUP_ALREADY_COMPLETED`.
- Kolejni platform ownerzy mają być dodawani później przez platform ownera w UI platform members.

Dashboard MVP nadal ma dodać:

- `/platform/access-requests`,
- podstawowe platform lists.

Nie dodawać jeszcze:

- shadcn,
- pełnego design systemu,
- billing,
- marketplace,
- email invitations,
- catalog import UI poza placeholderem,
- stats dashboard poza placeholderem.

## 8. Finalny werdykt

Kierunek jest dobry. Fundament backendowy jest mocny. Produkcyjność jeszcze nie.

Aktualny stan można opisać tak:

```txt
Architecture direction: correct
Backend foundation: strong MVP
Public-web MVP: usable, but rough
Production readiness: not yet
Main risk: treating D2 operator queue MVP as full dashboard CRUD/platform workflow
```

## 9. Typecheck integrity cleanup

Repo nie opiera się już na `node --experimental-strip-types` jako pozornym typechecku. Root `pnpm typecheck` uruchamia realne `tsc --noEmit` dla targetowych workspaces (`packages/domain`, `packages/db`, `apps/api`, `packages/shared`, `apps/public-web`, `apps/dashboard-web`) oraz `tsconfig.tests.json`.

Domyślne `pnpm dev` i `pnpm build` wskazują target architecture: Fastify API + Next.js public-web + Next.js dashboard-web. Legacy Vite app oraz legacy `node:http` API pozostają jako reference/prototype, ale są uruchamiane wyłącznie przez jawne skrypty `dev:web:legacy`, `build:web:legacy` i `dev:api:legacy`.

Wskazane błędy TS z QA zostały naprawione bez dodawania Vitesta ani nowych runtime technologii: permission mappings `.includes()`, narrowowanie `server.address()`, normalizacja `EventSummary.startsAt/endsAt` oraz typing response headers.
