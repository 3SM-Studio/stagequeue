# Poza Nuta

## Lokalny Postgres i Drizzle

Docelowy backend platformy bedzie oparty o PostgreSQL, Drizzle i migracje SQL. Legacy JSON-y w `data/events` oraz `data/imports` zostaja na razie jako material referencyjny MVP, ale nie sa targetowym storage dla kolejki ani katalogu.

Lokalna baza:

```bash
docker compose up -d
```

Domyslny `DATABASE_URL`:

```env
DATABASE_URL=postgres://poza_nuta:poza_nuta@localhost:5432/poza_nuta
```

Schema Drizzle znajduje sie w `packages/db/src/schema.ts`, konfiguracja w `packages/db/drizzle.config.ts`, a migracje w `packages/db/drizzle`.

Podstawowe komendy:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed:catalog
pnpm db:studio
```

`pnpm db:seed:catalog` przygotowuje bazowe zrodla globalnego katalogu: `ising` i `karafun`. Pelny import katalogu iSing do Postgresa jest osobnym krokiem i nie jest wykonywany przez seed.

## Local QA demo data

Do recznego smoke testu public-web mozesz przygotowac demo lokal, aktywny event i przykladowa kolejke:

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed:catalog
pnpm db:seed:demo
pnpm dev:api
pnpm dev:public
```

Seed `pnpm db:seed:demo` jest idempotentny. Tworzy albo aktualizuje organizacje `poza-nuta-demo`,
lokal `demo-klub`, event `demo-karaoke` oraz resetuje kolejke demo do stalego zestawu przykladowych
requestow. Nie tworzy prawdziwych userow auth ani sekretow.

Adresy do QA:

- `http://localhost:3000/demo-klub`
- `http://localhost:3000/demo-klub/join`
- `http://localhost:3000/demo-klub/queue`

## Source package do audytu

Nie pakuj recznie calego katalogu roboczego. Source ZIP do audytu tworz przez:

```bash
pnpm pack:source
```

Skrypt uzywa `git archive` i zapisuje `poza-nuta-source.zip`, a potem uruchamia hygiene check. Paczka zrodlowa nie moze zawierac `.env`, `node_modules`, `.next`, `.next-build`, `.next-public`, `dist`, `build`, `coverage`, `.turbo`, lokalnych dumpow danych ani logow.

`.env` nigdy nie trafia do paczki ani commita. W repo zostaja tylko placeholdery typu `.env.example` oraz migracje Drizzle w `packages/db/drizzle`.

## Typecheck i docelowy dev workflow

Root `pnpm typecheck` uruchamia teraz realny `tsc --noEmit` dla `packages/domain`, `packages/db`, `apps/api`, `packages/shared`, `apps/public-web` oraz `tsconfig.tests.json`. Dodatkowy `pnpm check:architecture` zostaje jako lekki custom check repo, ale nie zastępuje TypeScript compiler checku.

Domyślne komendy idą w target architecture:

```bash
pnpm dev
pnpm build
```

`pnpm dev` uruchamia Fastify API (`apps/api`), Next.js public-web (`apps/public-web`) i Next.js dashboard-web (`apps/dashboard-web`) równolegle. `pnpm build` buduje teraz `public-web` oraz `dashboard-web`.

Legacy prototype jest nadal dostępny jawnie:

```bash
pnpm dev:api:legacy
pnpm dev:web:legacy
pnpm build:web:legacy
```

`apps/web` oraz `apps/api/src/server.ts` zostają chwilowo jako legacy reference i coverage dla starego MVP. Nie są domyślnym kierunkiem rozwoju platformy.

Szybki check bez tworzenia ZIP-a:

```bash
pnpm check:clean-package
```

## Import metadanych iSing

Importer buduje lokalny, prywatny indeks metadanych dostępnych utworow karaoke z iSing.

1. Skopiuj `.env.example` do `.env`.
2. Ustaw `ISING_CLIENT_ID`.
3. Uruchom:

```bash
pnpm import:ising
```

Wynik zostanie zapisany w `data/imports/ising-songs.json`, a raport importu w `data/imports/ising-import-report.json`.

### Konfiguracja klienta

`ISING_CLIENT_ID` pochodzi z publicznego requestu webowego iSing i nie jest traktowany jako prywatny sekret uzytkownika. Trzymamy go w `.env` tylko dlatego, ze moze sie zmienic i nie chcemy hardcodowac go w kodzie.

Importer domyslnie nie wymusza botowego User-Agenta. Jesli iSing poprosi o konkretny User-Agent albo dodatkowa identyfikacje ruchu, mozna ustawic `ISING_IMPORT_USER_AGENT`. `ISING_IMPORT_CONTACT_EMAIL` jest opcjonalne i sluzy tylko do wewnetrznej dokumentacji albo logowania.

### Paginacja iSing

iSing API uzywa offset pagination przez parametr `start`, np. `start=20`, `start=40`, `start=60`. Parametr `per_page=50` moze byc ignorowany albo limitowany przez API, dlatego importer nie moze na nim polegac.

Importer zawsze musi uzywac `links.next` z odpowiedzi API. Nie wolno recznie wyliczac kolejnych wartosci `start`; `links.next` jest jedynym zrodlem prawdy dla paginacji.

Ograniczenia:

- importer sluzy tylko do prywatnego indeksu metadanych dostepnosci piosenek karaoke,
- nie pobiera tekstow, audio, nagran, profili uzytkownikow ani komentarzy,
- nie wolno wystawiac pelnej kopii katalogu iSing publicznie,
- importer dziala tylko jako okresowy lokalny import metadanych i nie wolno uzywac go ani iSing API jako live proxy dla wyszukiwan uzytkownikow,
- po publikacji oficjalnego publicznego API iSing adapter nalezy wymienic na oficjalna integracje.

## Lokalne wyszukiwanie piosenek

Najpierw zbuduj lokalny indeks:

```bash
pnpm import:ising
```

Potem wyszukuj po lokalnie zaimportowanych metadanych:

```bash
pnpm search:songs "krolowa lez"
```

Wyszukiwarka czyta tylko `data/imports/ising-songs.json` i nie odpytuje iSing API. Pelny katalog importu nie powinien byc commitowany; pliki `data/imports/*.json` sa ignorowane przez git.

## Lokalna kolejka karaoke

To jest lokalny silnik kolejki bez UI, QR i endpointow HTTP. Dane eventow sa runtime i nie powinny byc commitowane; pliki `data/events/*.json` sa ignorowane przez git.

Przykladowy flow:

```bash
pnpm queue create --id test-event --name "Poza Nutą Test"
pnpm queue add --event test-event --singer "Michał" --title "Królowa Łez" --artist "Agnieszka Chylińska" --source ising --source-id 9053 --url "https://ising.pl/agnieszka-chylinska-krolowa-lez-piosenka"
pnpm queue approve --event test-event --request <request-id>
pnpm queue start --event test-event --request <request-id>
pnpm queue done --event test-event
pnpm queue public --event test-event
```

Kolejka dziala wylacznie na lokalnym JSON `data/events/<event-id>.json` i nie odpytuje iSing API podczas operacji kolejki.

Publiczny widok kolejki pokazuje aktualnie spiewajaca osobe jako `Now`, pierwsza zaakceptowana osobe jako `Next`, a `Upcoming` zawiera dopiero kolejne zaakceptowane requesty po `Next`.

## Dodawanie requestu z wyszukiwarki

Mozesz dodac request do kolejki bez recznego przepisywania tytulu, artysty, source id i URL-a. Komenda korzysta wylacznie z lokalnego indeksu `data/imports/ising-songs.json` i nie odpytuje iSing API.

Przykladowy flow:

```bash
pnpm import:ising
pnpm queue create --id test-event --name "Poza Nutą Test"
pnpm queue add-from-search --event test-event --singer "Michał" --query "krolowa lez"
pnpm queue approve --event test-event --request <id>
pnpm queue public --event test-event
```

Dodatkowe opcje:

- `--min-score <number>` ustawia minimalny confidence score, domyslnie `60`.
- `--pick <number>` wybiera konkretny wynik z top listy, numerowany od `1`.
- `--dry-run` pokazuje, co zostaloby dodane, ale nie zapisuje zmian do pliku eventu.

## Fastify API skeleton

Nowy docelowy backend znajduje sie w `apps/api` i jest szkieletem Fastify pod Better Auth, permissions, route groups, SSE oraz operacje DB. To nie jest jeszcze implementacja domenowych endpointow kolejki ani organizacji.

Uruchom lokalnego Postgresa i migracje:

```bash
docker compose up -d
pnpm db:migrate
```

Uruchom API:

```bash
pnpm dev:api
```

`pnpm dev:api` uruchamia `apps/api/src/index.ts` w watch mode przez natywne `node --watch`. Legacy API na `node:http` zostaje jako reference i mozna je uruchomic przez:

```bash
pnpm dev:api:legacy
```

Nowy skeleton wystawia na tym etapie:

```bash
curl http://127.0.0.1:4321/health
curl http://127.0.0.1:4321/me
curl http://127.0.0.1:4321/public
curl http://127.0.0.1:4321/dashboard
curl http://127.0.0.1:4321/platform
```

`/health` sprawdza polaczenie z baza. Pozostale grupy tras sa placeholderami pod kolejne fazy. CORS jest allowlistowany do `PUBLIC_WEB_URL` i `DASHBOARD_WEB_URL`, cookies sa wlaczone pod przyszle sesje, a globalny rate limit dziala bez Redis.

### Auth i closed beta

Fastify API ma podlaczone Better Auth pod sciezka:

```txt
/auth/*
```

Google OAuth jest konfigurowany przez:

```env
GOOGLE_CLIENT_ID=replace_me
GOOGLE_CLIENT_SECRET=replace_me
AUTH_SECRET=replace_me_with_at_least_32_random_characters
PARTICIPANT_TOKEN_SECRET=replace_me_with_at_least_32_random_characters
PUBLIC_REQUEST_MAX_ACTIVE_PER_PARTICIPANT=3
PUBLIC_REQUEST_COOLDOWN_SECONDS=20
BOOTSTRAP_PLATFORM_OWNER_EMAIL=replace_me@example.com
```

Better Auth zapisuje swoje dane w tabelach `auth_users`, `auth_sessions`, `auth_accounts` i `auth_verifications`. Domenowy rekord platformy jest mapowany przez `users.auth_user_id`, a role platformowe sa w `platform_memberships`; nie ma docelowego `isAdmin`.

`GET /me`:

- bez sesji zwraca `{ "authenticated": false }`,
- z sesja tworzy albo aktualizuje domenowego usera,
- user bez approval ma `status: "pending"` i nie ma dashboard access,
- user z emailem rownym `BOOTSTRAP_PLATFORM_OWNER_EMAIL` dostaje idempotentnie role `platform_owner` i status `active`.

W produkcji cookies Better Auth maja dzialac jako secure httpOnly session cookies. Dla subdomen ustaw `COOKIE_DOMAIN=.poza-nuta.pl`; lokalnie `COOKIE_DOMAIN=localhost` albo puste ustawienie pozwala testowac dev flow.

Do jednorazowego sprawdzenia runtime bez zostawiania serwera w terminalu:

```bash
pnpm smoke:api
```

`smoke:api` uruchamia API w tle, czeka na `/health`, wypisuje wynik i zatrzymuje proces. `dev` oraz `start` sa long-running server commands i nie powinny byc traktowane jako checki konczace sie same.

## Legacy lokalne API karaoke

Ta sekcja opisuje prototypowe API na `node:http`, ktore zostaje tylko jako material referencyjny i kompatybilny runtime dla starego Vite MVP. Nie jest docelowym backendem platformy venue-first.

API jest lokalnym, dev-first mostem pod przyszly frontend, QR i panel operatora. Dziala wylacznie na lokalnych JSON-ach: `data/imports/ising-songs.json` oraz `data/events/*.json`. API nie odpytuje iSing podczas wyszukiwania ani operacji kolejki.

Aplikacja API znajduje sie w `apps/api`. Domain/core pozostaje tymczasowo w rootowym `src` (`src/queue`, `src/search`, `src/importers`) jako etap przejsciowy przed ewentualnym wydzieleniem `packages/domain` i `packages/shared`.

Uruchomienie:

```bash
pnpm dev:api:legacy
```

`pnpm dev:api:legacy` dziala w watch mode przez natywne `node --watch`, wiec lokalny serwer API restartuje sie po zmianach kodu. Na tym etapie `nodemon` nie jest potrzebny. Jesli natywny watch Node okaze sie niewystarczajacy przy wiekszej strukturze repo, mozna pozniej rozwazyc `nodemon` albo `tsx`.

API loguje lokalnie requesty w formacie `[api] <requestId> <method> <path> <status> <durationMs>ms`. Kazda odpowiedz ma header `X-Request-Id`, co pomaga powiazac blad z frontendu z logiem backendu. Domyslnie `API_LOG_LEVEL=info`; ustaw `API_LOG_LEVEL=silent`, jesli chcesz wyciszyc access logi. Logi nie powinny zawierac pelnych body requestow, tokenow ani naglowka `Authorization`.

Widoki operatora i publicznej kolejki uzywaja pollingu. Zeby logi zostaly czytelne, `API_LOG_LEVEL=info` ukrywa rutynowe access logi dla `OPTIONS`; bledy nadal sa logowane. Ustaw `API_LOG_LEVEL=debug`, jesli potrzebujesz glebszego debugowania CORS/preflight.

Domyslnie serwer binduje do `127.0.0.1:4321`. Konfiguracja:

```env
API_HOST=127.0.0.1
API_PORT=4321
API_ADMIN_TOKEN=
API_LOG_LEVEL=info
```

Jesli port `4321` jest zajety, zamknij poprzedni proces API albo ustaw inny `API_PORT`.

Git Bash/CMD:

```bash
netstat -ano | findstr :4321
cmd.exe /c "taskkill /PID <PID> /F"
```

PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 4321
Stop-Process -Id <PID> -Force
```

Jesli `API_ADMIN_TOKEN` jest ustawiony, endpointy operatorskie wymagaja naglowka `Authorization: Bearer <token>`. Publiczne endpointy i endpoint zgloszenia requestu uczestnika nie wymagaja tokena.

Health check:

```bash
curl http://127.0.0.1:4321/health
```

Lokalne wyszukiwanie, limitowane i bez zwracania pelnego katalogu:

```bash
curl "http://127.0.0.1:4321/api/search?q=krolowa%20lez"
```

Utworzenie eventu:

```bash
curl -X POST http://127.0.0.1:4321/api/events \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"test-event\",\"name\":\"Poza Nutą Test\"}"
```

Zgloszenie requestu uczestnika po lokalnym `sourceSongId`; tytul, artysta i URL sa brane z lokalnego indeksu, nie z body:

```bash
curl -X POST http://127.0.0.1:4321/api/events/test-event/requests \
  -H "Content-Type: application/json" \
  -d "{\"singerName\":\"Michał\",\"songSource\":\"ising\",\"songSourceId\":\"9053\"}"
```

Na Windows/Git Bash polskie znaki wpisane bezposrednio w `curl -d "{...}"` moga zostac wyslane w zlym kodowaniu terminala. Do recznych testow z polskimi znakami preferuj pliki JSON zapisane jako UTF-8.

`event.json`:

```json
{
  "id": "api-smoke",
  "name": "Poza Nutą API Smoke"
}
```

`request.json`:

```json
{
  "singerName": "Michał",
  "songSource": "ising",
  "songSourceId": "9053"
}
```

```bash
curl -X POST http://127.0.0.1:4321/api/events \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @event.json
```

```bash
curl -X POST http://127.0.0.1:4321/api/events/api-smoke/requests \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @request.json
```

Publiczna kolejka:

```bash
curl http://127.0.0.1:4321/api/events/test-event/public-queue
curl "http://127.0.0.1:4321/api/events/test-event/public-queue?hideSongTitles=true"
```

Kolejka operatora i akcje operatorskie:

```bash
curl http://127.0.0.1:4321/api/events/test-event/operator-queue
curl -X POST http://127.0.0.1:4321/api/events/test-event/requests/<request-id>/approve
curl -X POST http://127.0.0.1:4321/api/events/test-event/requests/<request-id>/start
curl -X POST http://127.0.0.1:4321/api/events/test-event/done
```

Publiczny frontend, QR i panel operatora sa nastepnym etapem; tutaj jest tylko lokalne API nad istniejacym search i queue core.

## Public-web Next.js

Nowa aplikacja publiczna uczestnika znajduje sie w `apps/public-web` i jest docelowym kierunkiem dla domeny `poza-nuta.pl`. To cienki klient Next.js do Fastify API; nie laczy sie bezposrednio z baza i nie odpytuje iSing.

Uruchomienie lokalne:

```bash
pnpm dev:api
pnpm dev:public
```

Build:

```bash
pnpm build:public
```

Konfiguracja:

```env
API_INTERNAL_URL=
NEXT_PUBLIC_API_URL=http://localhost:4321
```

`API_INTERNAL_URL` jest opcjonalny i jest uzywany tylko przez server-side public-web, czyli Server Components/SSR w Next.js. Pozwala odpytac Fastify API po wewnetrznym adresie, np. `http://api:4321`. Fallback: `NEXT_PUBLIC_API_URL`, a potem `http://localhost:4321`.

`NEXT_PUBLIC_API_URL` jest uzywany przez browser/client components, w tym submit formularza i SSE `EventSource`. Ten URL musi byc osiagalny z przegladarki uzytkownika. Lokalny fallback to `http://localhost:4321`.

MVP public-web uzywa venue-first active event flow:

- `/` - strona startowa,
- `/[venueSlug]` - publiczny profil lokalu i linki do aktywnego flow,
- `/[venueSlug]/join` - formularz zgloszenia dla aktywnego eventu,
- `/[venueSlug]/queue` - publiczna kolejka z live odswiezaniem przez SSE.

Zarezerwowane placeholdery pod przyszly event-specific routing:

- `/[venueSlug]/events/[eventSlug]`,
- `/[venueSlug]/events/[eventSlug]/join`,
- `/[venueSlug]/events/[eventSlug]/queue`,
- `/org/[organizationSlug]` - placeholder publicznego profilu organizacji.

Event-slug routes nie sa jeszcze pelnym publicznym flow i nie powinny byc opisywane ani traktowane jako gotowa funkcja. Aktualny MVP jest venue-first: podstawowy join/queue flow nie wymaga znajomosci event UUID po stronie public-web.

Preferowane endpointy publiczne dla uczestnika:

```txt
GET  /public/venues/:venueSlug/queue
POST /public/venues/:venueSlug/requests
GET  /public/venues/:venueSlug/stream
```

Event-based endpointy `GET/POST /public/events/:eventPublicId/*` zostaja tymczasowo jako low-level/event-specific compatibility API, ale public-web uzywa venue-first endpointow dla queue snapshotu, submitu i SSE.

Public submit uzywa anonimowego cookie `pn_participant`. Uczestnik nie zaklada konta, token nie trafia do response body, a baza zapisuje tylko hash w `song_requests.participant_token_hash`. `PARTICIPANT_TOKEN_SECRET` sluzy do HMAC-SHA-256; jesli nie jest ustawiony, API uzywa `AUTH_SECRET` jako fallback. Dodatkowe limity antyspamowe: maksymalnie `PUBLIC_REQUEST_MAX_ACTIVE_PER_PARTICIPANT` aktywne requesty (`pending`, `approved`, `now`) per event oraz cooldown `PUBLIC_REQUEST_COOLDOWN_SECONDS` sekund per participant/event. Dotychczasowy IP+event rate limit zostaje jako fallback.

`/[venueSlug]/join` nadal moze sprawdzic `GET /public/venues/:venueSlug/active-event` do UX/inactive state, ale wysyla request przez `POST /public/venues/:venueSlug/requests`. Jesli nie ma aktywnego eventu, pokazuje inactive state; jesli event jest paused, blokuje zgloszenia i pokazuje stan wstrzymania.

`/[venueSlug]/queue` pobiera queue przez `GET /public/venues/:venueSlug/queue` i laczy sie z `GET /public/venues/:venueSlug/stream`. Dla lokalu bez active/paused eventu API zwraca stabilny inactive shape z `activeEvent: null`, pusta kolejka i `submissions.enabled=false`. Po eventach `queue.updated`, `request.*` albo `event.*` frontend odswieza snapshot z API. API pozostaje source of truth; frontend nie utrzymuje wlasnej kolejki. Join i queue maja `noindex`.

## Dashboard-web MVP foundation

Dashboard znajduje sie w `apps/dashboard-web` i jest osobna aplikacja Next.js App Router dla docelowego hosta `dashboard.poza-nuta.pl`. Lokalnie dziala na:

```bash
pnpm dev:dashboard
```

Adres lokalny:

```txt
http://localhost:3001
```

Konfiguracja:

```env
NEXT_PUBLIC_API_URL=http://localhost:4321
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3001
```

Dashboard komunikuje sie wylacznie z Fastify API i nie dotyka bazy bezposrednio. Requesty do API uzywaja `credentials: include`, zeby sesje Better Auth w cookie mogly dzialac miedzy dashboardem i API.

D1 route'y:

- `/` - przekierowanie do `/dashboard`,
- `/login` - CTA logowania przez Google,
- `/dashboard` - odczyt `GET /me` i shell dostepu,
- `/dashboard/access` - stan dostepu closed beta,
- `/dashboard/organizations` - placeholder,
- `/dashboard/venues` - placeholder,
- `/dashboard/events` - wejscie manualne po eventId,
- `/dashboard/events/:eventId/queue` - D2 operator queue MVP.

Login CTA kieruje do Better Auth w API:

```txt
/auth/sign-in/social?provider=google&callbackURL=http://localhost:3001/dashboard
```

Bez prawdziwych Google OAuth credentials lokalnie mozna zweryfikowac render i stan `authenticated=false`, ale nie nalezy raportowac pelnego OAuth smoke jako przechodzacego. `GET /me` nadal jest zrodlem prawdy dla stanow:

- `authenticated=false` - pokazuje CTA logowania,
- `authenticated=true` i `dashboardAllowed=false` - pokazuje brak dostepu / pending closed beta,
- `dashboardAllowed=true` - pokazuje shell z uzytkownikiem, rolami platformowymi i linkami do organizacji, lokali oraz wydarzen.

D2 dodaje pierwszy panel operatora kolejki. Widok pobiera `GET /dashboard/events/:eventId/operator-queue`,
laczymy go z `GET /dashboard/events/:eventId/stream` przez SSE i uzywa istniejacych endpointow mutacji:

```txt
POST /dashboard/events/:eventId/requests/:requestId/approve
POST /dashboard/events/:eventId/requests/:requestId/reject
POST /dashboard/events/:eventId/requests/:requestId/start
POST /dashboard/events/:eventId/requests/:requestId/done
POST /dashboard/events/:eventId/requests/:requestId/skip
POST /dashboard/events/:eventId/requests/:requestId/move
```

Panel pokazuje `pending`, `approved`, `now`, `done`, `rejected` i `skipped`. Nie dotyka DB bezposrednio i nie obchodzi permission layera API. Nadal nie zawiera pelnego CRUD organizacji/lokali/eventow, catalog runtime ani stats.

### Dashboard operator queue local QA

Uruchom lokalnie:

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed:catalog
pnpm db:seed:demo
pnpm dev
```

Dashboard:

```txt
http://localhost:3001/dashboard
http://localhost:3001/dashboard/events/<eventId>/queue
```

Demo eventId znajdziesz w Postgresie:

```sql
select id, slug, status from events where slug = 'demo-karaoke';
```

Bez prawdziwej sesji Google OAuth panel poprawnie pokaze stan logowania/braku dostepu. D2 nie dodaje auth bypassa do lokalnego QA.

## Frontend MVP

Frontend MVP jest cienkim klientem React/Vite do lokalnego API. Nie odpytuje iSing i nie zawiera jeszcze QR, logowania, AI ani finalnego designu.

To jest legacy prototype reference. Pelny stary flow participant/operator/public wymaga prototypowego API:

```bash
pnpm dev:api:legacy
pnpm dev:web:legacy
```

Docelowy rootowy dev workflow:

```bash
pnpm dev
```

`pnpm dev` uruchamia Fastify API, Next.js public-web i Next.js dashboard-web rownolegle w jednym terminalu przez `concurrently`. Logi sa prefiksowane jako `API`, `PUBLIC` i `DASHBOARD`, a zatrzymanie procesu konczy wszystkie serwery. `concurrently` sluzy tylko do lokalnego dev workflow.

Adresy lokalne:

- API: `http://127.0.0.1:4321`
- Public-web: `http://127.0.0.1:3000`
- Dashboard-web: `http://127.0.0.1:3001`
- Legacy Vite web: `http://127.0.0.1:5173`

Web dev server ma celowo staly port `5173` (`strictPort: true`). Jesli port `5173` jest zajety, zamknij poprzedni proces zamiast pozwalac Vite przejsc na `5174`, bo README, CORS i lokalne linki zakladaja `5173`.

Docelowe serwery mozna nadal uruchamiac osobno:

```bash
pnpm dev:api
pnpm dev:public
pnpm dev:dashboard
```

Dla starego pelnego flow kolejkowego Vite uzyj `pnpm dev:api:legacy` oraz `pnpm dev:web:legacy`.

Utworz event:

```bash
curl -X POST http://127.0.0.1:4321/api/events \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "{\"id\":\"test-event\",\"name\":\"Poza Nutą Test\"}"
```

Adresy widokow:

- participant: `http://127.0.0.1:5173/event/test-event`
- public queue: `http://127.0.0.1:5173/event/test-event/public`
- operator: `http://127.0.0.1:5173/event/test-event/operator`

Konfiguracja frontendu:

```env
VITE_API_BASE_URL=http://127.0.0.1:4321
```

Participant view pozwala wpisac imie, wyszukac piosenke w lokalnym indeksie i wyslac pending request. Operator view pokazuje pending/approved/now/history i pozwala approve, reject, start, skip oraz done. Public view pokazuje Now, Next i Upcoming z pollingiem.
