# Poza Nuta - Database Backup and Migration Runbook

Ten runbook opisuje praktyczny proces backupu, migracji i restore dla produkcyjnej bazy Stagequeue / Poza Nuta. Dotyczy Postgresa zarzadzanego przez hosting oraz migracji Drizzle z `packages/db/drizzle/`.

Nie zapisuj `DATABASE_URL`, tokenow, sekretow, cookie ani pelnych dumpow danych w repozytorium, issue, PR-ach, Slacku ani screenshotach.

## 1. Kiedy backup jest wymagany

Backup produkcyjnej bazy jest wymagany:

- przed kazda migracja DB;
- przed release, ktory zawiera zmiany w `packages/db/src/schema.ts` albo nowe pliki w `packages/db/drizzle/`;
- przed reczna interwencja w produkcyjne dane;
- przed importem katalogu albo masowa zmiana danych;
- przed eksperymentalnym jobem, backfillem albo skryptem administracyjnym;
- przed recovery po incydencie, jesli baza nadal odpowiada i snapshot jest mozliwy.

Backup wykonuj przed zmiana, nie dopiero po pierwszym bledzie.

## 2. Pre-migration checklist

Przed migracja:

- [ ] GitHub Actions `Repository CI / Quality gates` jest zielony.
- [ ] Branch/release opiera sie o czysty `main` albo zaakceptowany release branch.
- [ ] PR zawierajacy migracje zostal zreviewowany.
- [ ] Sprawdzono wygenerowane SQL w `packages/db/drizzle/`, nie tylko TypeScript schema.
- [ ] Zidentyfikowano migration id / plik, np. `0006_common_lorna_dane.sql`.
- [ ] Ustalono, czy migracja jest addytywna, destrukcyjna, blokujaca albo wymagajaca backfillu.
- [ ] Ustalono maintenance window.
- [ ] Potwierdzono, ze nie trwa live karaoke event.
- [ ] Wyznaczono osobe odpowiedzialna za migracje.
- [ ] Ustalono osobe decyzyjna dla rollback / roll-forward.
- [ ] Przygotowano sposob sprawdzenia `/health` po migracji.

Nie uruchamiaj migracji podczas live karaoke eventu bez jawnej decyzji SEV i planu manualnej kolejki.

### C18b CHECK constraints pre-check

Przed migracja `0010_even_prodigy.sql` uruchom ponizszy pre-check na docelowej bazie staging albo production. Wynik powinien miec `invalid_count = 0` dla kazdego wiersza. Zapytanie nie wypisuje danych uczestnikow ani sekretow.

```sql
select 'users.status' as column_name, count(*) as invalid_count
from users
where status not in ('pending', 'active', 'disabled')
union all
select 'platform_memberships.role', count(*)
from platform_memberships
where role not in ('platform_owner', 'platform_admin')
union all
select 'platform_memberships.status', count(*)
from platform_memberships
where status not in ('active', 'disabled')
union all
select 'organization_memberships.role', count(*)
from organization_memberships
where role not in ('owner', 'admin', 'booking_manager', 'host', 'operator', 'viewer')
union all
select 'organization_memberships.status', count(*)
from organization_memberships
where status not in ('invited', 'active', 'suspended', 'removed', 'disabled')
union all
select 'venues.status', count(*)
from venues
where status not in ('draft', 'active', 'archived')
union all
select 'venues.verification_status', count(*)
from venues
where verification_status not in ('unclaimed', 'pending', 'verified', 'rejected')
union all
select 'venue_organization_access.role', count(*)
from venue_organization_access
where role not in ('owner', 'manager', 'event_creator', 'karaoke_operator', 'viewer')
union all
select 'venue_organization_access.status', count(*)
from venue_organization_access
where status not in ('pending', 'active', 'revoked', 'expired', 'rejected')
union all
select 'events.status', count(*)
from events
where status not in ('draft', 'scheduled', 'active', 'paused', 'closed', 'archived', 'cancelled')
union all
select 'event_invites.status', count(*)
from event_invites
where status not in ('active', 'revoked')
union all
select 'event_staff_assignments.role', count(*)
from event_staff_assignments
where role not in ('lead_host', 'host', 'queue_operator', 'viewer')
union all
select 'event_staff_assignments.status', count(*)
from event_staff_assignments
where status not in ('active', 'removed')
union all
select 'song_requests.status', count(*)
from song_requests
where status not in ('pending', 'approved', 'now', 'done', 'skipped', 'rejected')
union all
select 'access_requests.status', count(*)
from access_requests
where status not in ('pending', 'approved', 'rejected')
union all
select 'access_requests.venue_access_role', count(*)
from access_requests
where venue_access_role not in ('owner', 'manager', 'event_creator', 'karaoke_operator', 'viewer');
```

Jesli dowolny licznik jest wiekszy niz `0`, zatrzymaj migracje i przygotuj jawny data cleanup/backfill. Kazda obca wartosc zablokuje `VALIDATE CONSTRAINT`; nie omijaj constraintow przez reczna edycje migracji ani nie naprawiaj danych bez aktualnego backupu.

### C18c CHECK constraints pre-check

Przed migracja `0011_aberrant_tyger_tiger.sql` uruchom ponizszy pre-check na docelowej bazie staging albo production. Wynik powinien miec `invalid_count = 0` dla kazdego wiersza. Zapytanie nie modyfikuje danych.

```sql
select 'organizations.type' as column_name, count(*) as invalid_count
from organizations
where type not in ('venue_owner', 'karaoke_company', 'agency', 'independent_host', 'platform')
union all
select 'organizations.status', count(*)
from organizations
where status not in ('pending', 'active', 'suspended', 'archived', 'disabled')
union all
select 'song_sources.status', count(*)
from song_sources
where status not in ('active', 'disabled')
union all
select 'catalog_import_runs.status', count(*)
from catalog_import_runs
where status not in ('queued', 'running', 'succeeded', 'failed', 'cancelled')
union all
select 'catalog_import_logs.level', count(*)
from catalog_import_logs
where level not in ('info', 'warn', 'error')
union all
select 'jobs.status', count(*)
from jobs
where status not in ('queued', 'running', 'succeeded', 'failed', 'cancelled');
```

Jesli dowolny licznik jest wiekszy niz `0`, zatrzymaj migracje i przygotuj jawny data cleanup/backfill. Kazda obca wartosc zablokuje `VALIDATE CONSTRAINT`; nie omijaj constraintow przez reczna edycje migracji ani nie naprawiaj danych bez aktualnego backupu.

## 3. Backup checklist

Przed migracja wykonaj minimum jeden backup produkcyjnej bazy:

- [ ] Snapshot DB w hostingu, jesli hosting go wspiera.
- [ ] Dump logiczny, jesli hosting pozwala na `pg_dump` albo eksport.
- [ ] Backup oznaczony data i czasem UTC.
- [ ] Backup oznaczony commit SHA release.
- [ ] Backup oznaczony migration id / nazwa pliku migracji.
- [ ] Backup ma wskazana osobe wykonujaca.
- [ ] Backup jest widoczny w panelu hostingu albo w bezpiecznym storage.
- [ ] Backup nie jest zapisany w repozytorium.
- [ ] Potwierdzono, ze backup nie jest pusty i zakonczyl sie sukcesem.

Minimalna notatka:

```txt
Backup ID:
Environment:
DB provider:
Timestamp UTC:
Commit SHA:
Migration files:
Operator:
Verification:
```

## 4. Migration execution

Kolejnosc dla standardowego release:

1. Zatrzymaj albo ogranicz ruch tylko wtedy, gdy migracja tego wymaga.
2. Wykonaj backup.
3. Uruchom migracje przed startem nowej wersji aplikacji, jesli nowy kod wymaga nowej schemy.
4. Wdroz aplikacje po poprawnej migracji.
5. Sprawdz `/health`.
6. Uruchom smoke checks.
7. Zapisz wynik w release evidence.

Lokalne komendy referencyjne:

```bash
pnpm db:migrate
pnpm smoke:api
```

W produkcji komenda migracji zalezy od hostingu i sposobu deploymentu. Musi uzywac produkcyjnego `DATABASE_URL` z secret managera hostingu, nigdy z pliku commitowanego do repo.

Nie uruchamiaj migracji drugi raz "dla pewnosci", jesli pierwsze uruchomienie zakonczylo sie bledem. Najpierw zdiagnozuj stan.

## 5. Restore drill

Restore drill to kontrolowany test odtworzenia backupu na staging albo lokalnym srodowisku testowym. Nie wykonuj drillu na produkcji.

Jak zweryfikowac backup:

1. Utworz izolowana baze staging/local.
2. Przywroc snapshot albo dump.
3. Uruchom aplikacje/API przeciwko tej bazie.
4. Uruchom migracje, jesli drill dotyczy upgrade path.
5. Sprawdz `/health`.
6. Sprawdz podstawowe dane:
   - `organizations`;
   - `venues`;
   - `events`;
   - `song_requests`;
   - `queue_events`;
   - `platform_support_audit_events`;
   - `platform_memberships`;
   - `auth_users` / `auth_sessions`, jesli backup obejmuje auth.
7. Wykonaj smoke flow: public venue, join request, operator queue.

Czestotliwosc:

- przed pierwszym produkcyjnym release z DB;
- po zmianie hostingu bazy;
- po zmianie strategii backupu;
- okresowo, minimum przed wiekszym milestone albo demo produkcyjnym.

## 6. Failed migration

Jesli migracja failuje:

1. Zatrzymaj deploy nowej wersji aplikacji.
2. Nie uruchamiaj migracji drugi raz bez diagnozy.
3. Zbierz logi migracji i timestampy.
4. Sprawdz, czy migracja weszla czesciowo:
   - nowe tabele;
   - nowe kolumny;
   - indeksy;
   - constrainty;
   - wpisy w tabeli metadanych migracji Drizzle.
5. Okresl, czy stara wersja aplikacji nadal dziala z aktualnym stanem DB.
6. Podejmij decyzje:
   - rollback aplikacji;
   - roll-forward poprawka migracji;
   - reczna naprawa DB z zaakceptowanym planem;
   - restore z backupu tylko jesli utrata zmian po backupie jest akceptowana.
7. Zapisz decyzje w release / incident evidence.

Nie cofaj destrukcyjnie DB bez jawnego planu i akceptacji osoby odpowiedzialnej.

## 7. Data safety

Tabele i dane szczegolnie chronione:

- `song_requests` - aktualny i historyczny stan requestow uczestnikow;
- `queue_events` - historia zmian kolejki i lifecycle;
- `events` - status eventu, public join/queue flags i relacja do venue;
- `platform_support_audit_events` - audit trail platform owner support access;
- `participant_token_hash` w `song_requests` - hash anonimowego participant tokena;
- `auth_users`, `auth_sessions`, `auth_accounts` - dane auth Better Auth;
- `platform_memberships` - role platformowe, w tym first owner.

Zasady:

- Nie usuwaj `platform_support_audit_events` bez decyzji retencyjnej.
- Nie kasuj `song_requests` ani `queue_events` podczas live eventu.
- Nie uruchamiaj `pnpm db:seed:demo` na produkcyjnej bazie.
- Nie resetuj DB jako workaround.
- Nie eksportuj danych uczestnikow do niekontrolowanych plikow.
- Nie loguj plaintext tokenow, cookie ani sekretow.

## 8. Post-migration smoke checks

Po migracji sprawdz:

- [ ] API `/health` zwraca OK i `db.ok=true`.
- [ ] Dashboard login przez Google dziala.
- [ ] Public venue page laduje widoczny lokal.
- [ ] Public join request tworzy pending request.
- [ ] Operator queue laduje pending/approved/now/history.
- [ ] Operator moze approve/start/done request.
- [ ] Public queue pokazuje dozwolone dane.
- [ ] Participant `my-requests` widzi status wlasnego requestu.
- [ ] `platform_support_audit_events` przyjmuje audit insert po support operation.
- [ ] `GET /dashboard/platform/support-audit-events` zwraca audit events tylko dla platform ownera.
- [ ] Nie ma nowych 500 w logach API.

Jesli smoke failuje, nie promuj release dalej bez decyzji rollback / roll-forward.

## 9. Rollback policy

Domyslna kolejnosc:

1. Rollback aplikacji do poprzedniego release.
2. Sprawdzenie, czy poprzednia aplikacja dziala z aktualna schema.
3. Roll-forward fix migracji, jesli DB jest w czesciowym stanie.
4. DB rollback albo restore tylko z jawnie zaakceptowanym planem.

DB rollback jest ryzykowny, bo po migracji mogly powstac nowe dane:

- nowe requesty uczestnikow;
- zmiany kolejki;
- lifecycle eventu;
- audit log support access;
- nowe sesje/uzytkownicy.

Destrukcyjne migracje wymagaja extra review przed release:

- drop table;
- drop column;
- data rewrite;
- zmiana typu kolumny;
- usuniecie albo przebudowa constraintu;
- backfill na duzej tabeli;
- zmiana unikalnosci slugow/pozycji kolejki.

## 10. Evidence

Po migracji zapisz dowody w release sign-off albo incident report.

Minimalny format:

| Field | Value |
|---|---|
| Environment |  |
| DB provider |  |
| Backup ID |  |
| Backup timestamp UTC |  |
| Commit SHA |  |
| Migration files |  |
| Migration command / runner |  |
| Operator |  |
| Start time UTC |  |
| End time UTC |  |
| Result | success / failed / partial |
| `/health` result |  |
| Smoke checks result |  |
| Audit log checked | yes / no |
| Rollback decision | none / app rollback / DB restore / roll-forward |
| Notes |  |

Dowody moga zawierac screenshoty panelu hostingu, ID backupu, log migracji bez sekretow i link do zielonego CI.

## 11. What not to do

- Nie commituj dumpow DB.
- Nie wklejaj `DATABASE_URL` do dokumentow, issue ani chatu.
- Nie uruchamiaj migracji na produkcji podczas live karaoke bez decyzji SEV.
- Nie resetuj DB w trakcie eventu.
- Nie usuwaj audit trail.
- Nie cofaj migracji "na oko".
- Nie odpalaj seedow demo na produkcji.
- Nie ignoruj partial migration state.
- Nie traktuj samego sukcesu komendy migracji jako pelnego smoke.
