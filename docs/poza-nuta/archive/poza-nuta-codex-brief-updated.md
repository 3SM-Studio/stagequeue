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

Aktualna liczba testów raportowana przez Codex po Phase 11: `144/144`.

## 3. Co nadal nie jest gotowe

Nie gotowe:

- `apps/dashboard-web` jako realna aplikacja Next.js.
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

`approve` liczy `position = approved.length + 1`. To jest race-prone.

Wymagane:

- unique partial index dla `approved` positions per event albo event queue lock,
- mapowanie unique violation na `409 CONFLICT`,
- test równoległych approve/move albo przynajmniej constraint test.

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
Phase 12 dashboard-web MVP
Phase 13 global catalog runtime
Phase 14 stats
Phase 15 CI/CD deployment
Phase 16 security hardening pass
```

H1-H5 zostały zamknięte w hardening patchach: source package hygiene, event staff assignment guard po `eventId`, spójne defaulty ról DB z permission model, venue-first public queue endpoints oraz participant token/anti-spam foundation. Kolejne kroki przed dashboardem pozostają H6.

## 7. Dashboard-web scope po hardeningu

Dashboard MVP ma zawierać:

- `/login`,
- `/access-pending`,
- `/organizations`,
- `/venues`,
- `/events/[eventId]/operator`,
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
Main risk: moving into dashboard/catalog before hardening P0/P1
```
