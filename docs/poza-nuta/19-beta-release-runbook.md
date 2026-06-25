# Poza Nuta - Closed Beta Release Runbook

Ten runbook spina operacyjne bramki dla zamknietej bety Stagequeue / Poza Nuta. Nie zastepuje `10-production-deployment-checklist.md`, `12-live-karaoke-manual-qa-playbook.md`, `13-qa-evidence-release-signoff-template.md` ani `15-db-backup-migration-runbook.md`; wskazuje, jakie dowody musza istniec przed decyzja beta GO.

Nie wpisuj tutaj sekretow, pelnych cookie, `DATABASE_URL`, `REDIS_URL`, participant tokenow ani pelnych invite code.

## A. Beta Go / No-Go Criteria

Decyzje podejmuje release owner razem z engineering ownerem i osoba odpowiedzialna za product/operator sign-off.

### GO

- [ ] CI jest zielone, w tym `Repository CI / Quality gates` i `Repository CI / DB migration smoke`.
- [ ] Wypelniono release evidence table w tym runbooku albo w kopii `13-qa-evidence-release-signoff-template.md`.
- [ ] Production/staging env jest kompletny i nie zawiera dev-only bootstrapow.
- [ ] Backup, C18b/C18c pre-check SQL, migracje i post-migration smoke przeszly.
- [ ] Manual QA live flow przeszedl bez P0/P1 regresji.
- [ ] Znane ograniczenia bety sa zaakceptowane przez release ownera.

### CONDITIONAL GO

- [ ] Nie ma P0 blockerow.
- [ ] Istnieja P1 ograniczenia z wlascicielem, workaroundiem i data follow-up.
- [ ] Release owner jawnie akceptuje ryzyko w evidence notes.
- [ ] Monitoring/log review po release ma wyznaczona osobe.

### NO-GO

- [ ] Public submit, operator queue albo auth/login nie dziala.
- [ ] Wystepuje wyciek sekretow, cookie, participant tokenow, raw DB errorow albo prywatnych danych kolejki.
- [ ] Migracje, pre-check SQL, backup albo restore decision point sa nieudokumentowane.
- [ ] Redis/Postgres production dependencies nie sa dostepne albo env validation nie przechodzi.
- [ ] P0/P1 issue nie ma wlasciciela, workaroundu albo decyzji release ownera.

## B. Required Environment Checklist

- [ ] `NODE_ENV=production`.
- [ ] `DATABASE_URL` wskazuje production/staging Postgres i nie jest logowany.
- [ ] `REDIS_URL` jest ustawione; production bez niego failuje przy config validation.
- [ ] `AUTH_SECRET` jest losowy, produkcyjny i ma minimum 32 znaki.
- [ ] `PARTICIPANT_TOKEN_SECRET` jest osobny od `AUTH_SECRET` i ma minimum 32 znaki.
- [ ] `PLATFORM_SETUP_TOKEN` jest ustawiony dla first-owner setup.
- [ ] `BOOTSTRAP_PLATFORM_OWNER_EMAIL` nie jest ustawiony w production.
- [ ] `GOOGLE_CLIENT_ID` i `GOOGLE_CLIENT_SECRET` pochodza z produkcyjnego/stagingowego OAuth clienta.
- [ ] Trusted origins / CORS obejmuja tylko oczekiwane public, dashboard i API originy.
- [ ] `COOKIE_DOMAIN` jest zgodny z domenami; cookies sa secure w production.
- [ ] `API_URL`, `PUBLIC_WEB_URL` i `DASHBOARD_WEB_URL` wskazuja HTTPS URL-e danego srodowiska.
- [ ] DB pool/timeouts sa ustawione albo swiadomie zostaja przy defaultach: `DATABASE_POOL_MAX=10`, `DATABASE_IDLE_TIMEOUT_MS=30000`, `DATABASE_CONNECTION_TIMEOUT_MS=5000`, `DATABASE_STATEMENT_TIMEOUT_MS=15000`, `DATABASE_LOCK_TIMEOUT_MS=5000`, `DATABASE_APPLICATION_NAME=stagequeue-api`.
- [ ] Rate limit settings sa zaakceptowane: global 300/min i public submit 5/min/event scope, a participant cooldown/max-active pozostaja domenowymi limitami queue service.
- [ ] `API_LOG_LEVEL` jest ustawiony odpowiednio do bety, bez wlaczania debug logs na stale w production.

## C. Database Migration Checklist

- [ ] Wykonano backup przed migracja i zapisano backup ID poza repo.
- [ ] Uruchomiono C18b pre-check SQL z `15-db-backup-migration-runbook.md`.
- [ ] Uruchomiono C18c pre-check SQL z `15-db-backup-migration-runbook.md`.
- [ ] Kazdy pre-check ma `invalid_count = 0`; obce wartosci zatrzymuja release.
- [ ] Uruchomiono migracje Drizzle na docelowej bazie.
- [ ] Zweryfikowano migration journal / applied migrations.
- [ ] Zweryfikowano, ze CHECK constraints sa validated.
- [ ] `/health` po migracji zwraca API OK i DB OK.
- [ ] Jest jawny rollback / restore decision point.
- [ ] Nie wykonano improwizowanego data cleanup bez aktualnego backupu i review.

## D. Redis Checklist

- [ ] Redis jest osiagalny z procesu API.
- [ ] `REDIS_URL` zasila Redis-backed EventBus/SSE i Redis-backed rate limit.
- [ ] Production bez `REDIS_URL` failuje przy config validation.
- [ ] Zespol akceptuje outage behavior:
  - SSE fanout degraduje sie bez durable replay.
  - Rate limit failuje closed dla chronionych requestow.
- [ ] Istnieje podstawowe operacyjne monitorowanie Redis reachability / provider health / error logs.

## E. Manual QA Script

Uzyj `12-live-karaoke-manual-qa-playbook.md` jako pelnego scenariusza. Minimalny beta pass musi objac:

- [ ] Platform owner setup przez `/setup` i `PLATFORM_SETUP_TOKEN`.
- [ ] Organization / venue setup.
- [ ] Venue verification path, jesli dotyczy testowanego srodowiska.
- [ ] Event create, start i open/public join flow.
- [ ] Public submit na `joinAccessMode=open`.
- [ ] `invite_required` blokuje public submit bez access.
- [ ] Invite claim nadaje access.
- [ ] Invite rotate/revoke blokuje przyszle claimy zgodnie z semantyka, bez cofania juz nadanego participant access.
- [ ] Operator approve/start/done/skip/reject/move, jesli dana akcja jest wspierana w UI/API.
- [ ] SSE reconnect albo browser refresh nie psuje kolejki ani mutacji.
- [ ] PublicId/internal UUID leak spot-check: publiczne DTO/URL-e nie ujawniaja internal UUID tam, gdzie nie powinny.
- [ ] Mobile public submit smoke.
- [ ] Basic error state smoke: API down, validation error, rate limit, blocked join.

## F. Auth / Cookie / OAuth Checklist

- [ ] Google OAuth redirect URLs wskazuja Better Auth callback API dla srodowiska.
- [ ] Trusted origins obejmuja public web, dashboard i API bez wildcard credentials.
- [ ] Session cookies sa secure/httpOnly w production.
- [ ] `COOKIE_DOMAIN` pozwala dashboard/API cookies dzialac miedzy oczekiwanymi subdomenami.
- [ ] Participant cookie `pn_participant` zapisuje sie w public flow, nie trafia do response body i nie jest logowane.
- [ ] Logout/session behavior jest sprawdzone, jesli dana powierzchnia go udostepnia.

## G. Observability Checklist

- [ ] Logi redaktuja `Authorization`, `cookie` i `set-cookie`.
- [ ] Logi nie zawieraja `DATABASE_URL`, `REDIS_URL`, participant tokenow, pelnych invite code, raw rate-limit key, IP z rate-limit key ani payloadow SSE.
- [ ] Oczekiwane structured log events sa znane:
  - `redis_event_bus_error`
  - `redis_rate_limit_error`
  - `db_pool_error`
  - `sse_stream_open`
  - `sse_stream_close`
  - `sse_stream_error`
- [ ] `API_LOG_LEVEL` jest potwierdzony dla srodowiska.
- [ ] C19/C17e observability nie jest metrics stackiem: brak Prometheus, OpenTelemetry, tracingu, alertingu i dashboardow metryk.

## H. Known Beta Limitations

- Brak durable SSE replay i gwarantowanego dostarczenia eventow po rozlaczeniu.
- Brak Prometheus, OpenTelemetry i alertingu.
- Invite links sa bearer-like; nie wolno ich publikowac ani logowac w pelnej wartosci.
- Participant identity zalezy od cookie/tokenu anonymous participant.
- Revoke/rotate invite nie cofa juz nadanego participant access.
- Rate limit moze false-positive za NAT-em albo wspoldzielonym IP.
- Queue mutation timing jest odroczone.
- `queue_events.type` constraints sa odroczone.
- Accessibility audit nie jest kompletny; mobile/public smoke jest minimalna bramka, nie pelny audyt a11y.

## I. Release Evidence Table

| Area | Required evidence | Command/manual step | Owner | Status | Notes |
|---|---|---|---|---|---|
| CI | Quality gates and DB migration smoke green | GitHub Actions run link |  |  |  |
| Env/secrets | Production/staging env checklist complete | Review hosting secret manager without pasting values |  |  |  |
| Database backup | Backup ID and timestamp recorded | Hosting snapshot / `pg_dump` flow |  |  |  |
| C18b pre-check | All invalid counts are zero | SQL from `15-db-backup-migration-runbook.md` |  |  |  |
| C18c pre-check | All invalid counts are zero | SQL from `15-db-backup-migration-runbook.md` |  |  |  |
| Migrations | Applied migrations verified | Hosting migration job / Drizzle migrate |  |  |  |
| Constraints | CHECK constraints validated | DB inspection / CI smoke evidence |  |  |  |
| Redis | Redis reachable and selected by API | Health/provider/log evidence |  |  |  |
| Auth/OAuth | Login and setup flow verified | Manual browser smoke |  |  |  |
| Public flow | Open event submit works | Manual QA |  |  |  |
| Invite flow | Invite-required, claim, rotate/revoke semantics verified | Manual QA |  |  |  |
| Operator flow | Queue actions verified | Manual QA |  |  |  |
| SSE/refresh | Reconnect/refresh behavior verified | Manual QA |  |  |  |
| Logs | Redaction and expected event names confirmed | Log sample without secrets |  |  |  |
| Rollback | App rollback and DB restore decision recorded | Release owner decision |  |  |  |

## J. Rollback Notes

- App rollback is the preferred first response when the previous app version is compatible with the migrated schema.
- DB rollback/restore requires a separate decision because new queue requests, lifecycle events, auth sessions and audit records may exist after release.
- Do not roll back migrations "na oko". Diagnose partial migration state first and prefer roll-forward when safe.
- Backup is required before destructive data cleanup, manual DB repair or restore.
- Redis/cache state is not the source of truth. Losing Redis state can degrade realtime fanout and rate-limit continuity, but Postgres remains the durable queue/event source.
- After rollback, rerun `/health`, public submit smoke, operator queue smoke and log review before declaring recovery complete.

## Docs Cleanup Candidates

- README still contains some historical/legacy wording. Do not clean it up during beta release unless it blocks operator understanding.
- Older archive docs may mention pre-C17 limitations; treat current runbooks and accepted decisions as source of truth.
