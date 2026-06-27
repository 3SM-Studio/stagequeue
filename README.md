# Poza Nuta

## Lokalny Postgres i Drizzle

Backend platformy jest oparty o PostgreSQL, Drizzle i migracje SQL. Rootowe narzedzia CLI nadal moga uzywac
lokalnych plikow w `data/events` i `data/imports`, ale nie sa one runtime storage aplikacji.

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

- `http://localhost:3000/` - public discovery,
- `http://localhost:3000/event/<eventPublicId>` - canonical event detail, submit i kolejka,
- `http://localhost:3000/demo-klub` - tymczasowy read-only profil lokalu.

`eventPublicId` odczytasz z kolumny `events.public_id`. Legacy URL-e `/demo-klub/join` i `/demo-klub/queue`
zwracaja 404.

## Source package do audytu

Nie pakuj recznie calego katalogu roboczego. Source ZIP do audytu tworz przez:

```bash
pnpm pack:source
```

Skrypt uzywa `git archive` i zapisuje `poza-nuta-source.zip`, a potem uruchamia hygiene check. Paczka zrodlowa nie moze zawierac `.env`, `node_modules`, `.next`, `.next-build`, `.next-public`, `dist`, `build`, `coverage`, `.turbo`, lokalnych dumpow danych ani logow.

`.env` nigdy nie trafia do paczki ani commita. W repo zostaja tylko placeholdery typu `.env.example` oraz migracje Drizzle w `packages/db/drizzle`.

## Typecheck i docelowy dev workflow

Root `pnpm typecheck` uruchamia realny `tsc --noEmit` dla `packages/domain`, `packages/db`, `apps/api`,
`packages/shared`, `apps/public-web`, `apps/dashboard-web` oraz `tsconfig.tests.json`. Dodatkowy
`pnpm check:architecture` zostaje jako lekki custom check repo, ale nie zastępuje TypeScript compiler checku.

Domyślne komendy idą w target architecture:

```bash
pnpm dev
pnpm build
```

`pnpm dev` uruchamia Fastify API (`apps/api`), Next.js public-web (`apps/public-web`) i Next.js dashboard-web
(`apps/dashboard-web`) rownolegle. `pnpm build` buduje `public-web` oraz `dashboard-web`. Fastify
`apps/api/src/index.ts` jest jedynym API runtime entrypointem.

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

## Fastify API

Backend znajduje sie w `apps/api` i uzywa Fastify, Better Auth, resource-level permissions, SSE oraz PostgreSQL.

Uruchom lokalnego Postgresa i migracje:

```bash
docker compose up -d
pnpm db:migrate
```

Uruchom API:

```bash
pnpm dev:api
```

`pnpm dev:api` uruchamia `apps/api/src/index.ts` w watch mode przez natywne `node --watch`.

API wystawia miedzy innymi:

```bash
curl http://127.0.0.1:4321/health
curl http://127.0.0.1:4321/me
curl http://127.0.0.1:4321/public
curl http://127.0.0.1:4321/dashboard
curl http://127.0.0.1:4321/platform
```

`/health` sprawdza polaczenie z baza. CORS jest allowlistowany do `PUBLIC_WEB_URL` i `DASHBOARD_WEB_URL`,
sesje uzywaja cookies Better Auth, a w development/test globalny rate limit moze dzialac in-memory.

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
REDIS_URL=
PUBLIC_REQUEST_MAX_ACTIVE_PER_PARTICIPANT=3
PUBLIC_REQUEST_COOLDOWN_SECONDS=20
# Development/test-only fallback. Production rejects this env and uses PLATFORM_SETUP_TOKEN.
BOOTSTRAP_PLATFORM_OWNER_EMAIL=replace_me@example.com
PLATFORM_SETUP_ENABLED=true
PLATFORM_SETUP_TOKEN=replace_me_with_one_time_setup_token
```

Better Auth zapisuje swoje dane w tabelach `auth_users`, `auth_sessions`, `auth_accounts` i `auth_verifications`. Domenowy rekord platformy jest mapowany przez `users.auth_user_id`, a role platformowe sa w `platform_memberships`; nie ma docelowego `isAdmin`.

`GET /me`:

- bez sesji zwraca `{ "authenticated": false }`,
- z sesja tworzy albo aktualizuje domenowego usera,
- user bez approval ma `status: "pending"` i nie ma dashboard access,
- produkcyjny first-owner flow musi uzywac `PLATFORM_SETUP_TOKEN` i `/setup` w dashboardzie,
- `BOOTSTRAP_PLATFORM_OWNER_EMAIL` jest tylko development/test-only; `NODE_ENV=production` z ta zmienna odmawia startu,
- user z emailem rownym `BOOTSTRAP_PLATFORM_OWNER_EMAIL` moze nadal dostac idempotentnie role `platform_owner` i status `active` w development/test.

W produkcji cookies Better Auth maja dzialac jako secure httpOnly session cookies. Dla subdomen ustaw `COOKIE_DOMAIN=.poza-nuta.pl`; lokalnie `COOKIE_DOMAIN=localhost` albo puste ustawienie pozwala testowac dev flow.

Zamknieta beta ma osobny runbook go/no-go i evidence checklist: `docs/poza-nuta/19-beta-release-runbook.md`.

### DB runtime pool i timeouty

Fastify API uzywa `DATABASE_URL` oraz jawnych ustawien runtime dla `pg` poola. Domyslne wartosci sa konserwatywne dla dev/test i startowego deploymentu:

```env
DATABASE_POOL_MAX=10
DATABASE_IDLE_TIMEOUT_MS=30000
DATABASE_CONNECTION_TIMEOUT_MS=5000
DATABASE_STATEMENT_TIMEOUT_MS=15000
DATABASE_LOCK_TIMEOUT_MS=5000
DATABASE_APPLICATION_NAME=stagequeue-api
```

Realne wartosci produkcyjne trzeba dobrac do hostingu, planu Postgresa, limitu polaczen DB i liczby replik API. `DATABASE_POOL_MAX` liczy sie per proces/instancje API, wiec laczny limit moze szybko urosnac przy skalowaniu horyzontalnym. `DATABASE_STATEMENT_TIMEOUT_MS` ogranicza maksymalny czas zapytania, a `DATABASE_LOCK_TIMEOUT_MS` ogranicza czekanie na lock. Puste, zerowe, ujemne i nie-numeryczne wartosci timeoutow/poola sa odrzucane przez walidacje configu.

`DATABASE_APPLICATION_NAME` trafia do polaczen Postgresa i powinien byc krotka, niesekretna nazwa aplikacji. SSL policy dla Postgresa nie jest czescia C17d; trzeba ja zdecydowac osobno dla konkretnego hostingu bez provider-specific hackow.

### Redis, SSE EventBus i rate limiting

Fastify API wybiera EventBus i infrastrukturalny rate limiter na podstawie konfiguracji. Bez `REDIS_URL` w development/test dzialaja adaptery in-memory, dobre tylko dla dev, testow i pojedynczej instancji procesu. Gdy `REDIS_URL` jest ustawione, API uzywa Redis Pub/Sub jako backendu EventBus oraz Redis-backed fixed-window rate limit dla abuse-prone HTTP routes. W `NODE_ENV=production` `REDIS_URL` jest wymagane przez walidacje konfiguracji, zeby multi-instance SSE fanout i rate limiting nie polegaly na pamieci jednego procesu.

SSE pozostaje kanalem best-effort: Redis Pub/Sub rozsyla nowe eventy, ale nie zapewnia replay ani gwarantowanego dostarczenia po rozlaczeniu klienta. Awaria Redis oznacza problemy z live update/SSE fanout; mutacje kolejki dalej wykonuja zwykle HTTP/DB flow i nie powinny zmieniac semantyki przez sam brak realtime. UI powinno dalej traktowac SSE jako niekrytyczne i uzywac istniejacych refetch/polling fallbackow.

Canonical public queue korzysta z `/public/events/:eventPublicId/stream`. Publiczne domain-update frame'y
zawieraja tylko `type` i `at`, bez internal event/venue/request IDs. Klient refetchuje snapshot po istotnym evencie
oraz po kazdym EventSource `open`, w tym reconnect; focus/visibility refresh jest lekkim fallbackiem. Dashboard
operator queue zachowuje chroniony `/dashboard/events/:eventId/stream` i polling fallback co 5 sekund.

Redis-backed rate limiting jest best-effort abuse protection, nie perfekcyjnym systemem quota ani durable counter store. Awaria Redis w production powoduje fail-closed dla chronionego requestu przez kontrolowany blad API; nie ma cichego fallbacku do in-memory w production. Domenowe limity uczestnika, takie jak `PUBLIC_REQUEST_MAX_ACTIVE_PER_PARTICIPANT` i `PUBLIC_REQUEST_COOLDOWN_SECONDS`, pozostaja osobnymi regulami queue service i nie sa tym samym co infrastrukturalny IP/route rate limiter.

### Lightweight observability

Fastify API uzywa structured logs z istniejacego loggera. C17e dodaje lekka obserwowalnosc runtime bez Prometheusa, OpenTelemetry, tracingu, alertingu, dashboardow metryk ani queue mutation timing.

Logger redaction obejmuje `Authorization`, `cookie` i `set-cookie`. Logi produkcyjne nie powinny zawierac `DATABASE_URL`, `REDIS_URL`, cookies, naglowka `Authorization`, participant tokenow, pelnego invite code, raw rate-limit key, IP z rate-limit key ani payloadow SSE.

Dodane structured log events:

- `redis_event_bus_error` dla bledow Redis EventBus publish/subscribe/unsubscribe/parse/close,
- `redis_rate_limit_error` dla bledow Redis-backed rate limit increment/close,
- `db_pool_error` dla bledow idle client/poola Postgresa,
- `sse_stream_open`, `sse_stream_close`, `sse_stream_error` dla lekkiego lifecycle SSE.

Future work po becie: metrics/alerts/tracing, ewentualny shared sanitizer helper oraz queue mutation latency/timing, jesli realne incidenty albo beta feedback pokaza taka potrzebe.

### Platform setup / first owner

Docelowy mechanizm pierwszego ownera platformy to jednorazowy setup:

```txt
http://localhost:3001/setup
```

API udostepnia:

```txt
GET  /setup/status
POST /setup/claim-platform-owner
```

`GET /setup/status` zwraca tylko `{ "setupRequired": true|false }`. `setupRequired=true` oznacza, ze w `platform_memberships` nie ma jeszcze aktywnego `platform_owner`.

`POST /setup/claim-platform-owner` wymaga:

- zalogowanej sesji Better Auth,
- poprawnego `PLATFORM_SETUP_TOKEN` w body `{ "setupToken": "..." }`,
- braku istniejacego aktywnego `platform_owner`.

Po poprawnym claimie API ustawia domenowego usera jako `active` i zapisuje `platform_owner` w `platform_memberships`. Gdy pierwszy owner istnieje, setup jest zamkniety i kolejne claimy zwracaja `409 SETUP_ALREADY_COMPLETED`. `/setup` jest one-time route: po `setupRequired=false` kieruje zalogowanego ownera do `/dashboard`, niezalogowanego usera do `/sign-in`, a zalogowanego usera bez dostepu do `/dashboard/access`. Kolejni platform ownerzy maja byc dodawani pozniej przez platform ownera w UI platform members.

Dashboard respektuje ten stan jako globalny access gate. Dopoki `setupRequired=true`, route'y `/dashboard/*` kieruja do `/setup` zamiast pokazywac pending approval, bo nie istnieje jeszcze platform owner, ktory moglby zaakceptowac konto. Login uruchomiony z `/setup` uzywa Better Auth callbacku `/setup`, wiec po Google OAuth user wraca do formularza tokena.

Do jednorazowego sprawdzenia runtime bez zostawiania serwera w terminalu:

```bash
pnpm smoke:api
```

`smoke:api` uruchamia API w tle, czeka na `/health`, wypisuje wynik i zatrzymuje proces. `dev` oraz `start` sa long-running server commands i nie powinny byc traktowane jako checki konczace sie same.

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

Public-web uzywa event-first participant flow:

- `/` - public discovery,
- `/event/[eventPublicId]` - canonical event detail i submit wedlug event access policy,
- `/event/[eventPublicId]/queue` - canonical read-only public queue dla wydarzenia,
- `/invite/[inviteCode]` - claim invite i redirect do canonical event page,
- `/[venueSlug]` - tymczasowy read-only profil lokalu; aktywny event linkuje do `/event/[eventPublicId]`.

Usuniete venue-scoped participant routes zwracaja 404 i nie redirectuja przez active-event lookup:

- `/[venueSlug]/join`,
- `/[venueSlug]/queue`,
- `/[venueSlug]/events/[eventSlug]`,
- `/[venueSlug]/events/[eventSlug]/join`,
- `/[venueSlug]/events/[eventSlug]/queue`.

`/event/[eventPublicId]/queue` uzywa istniejacego event-scoped API i nie przywraca venue lookup. Publiczne
i unlisted eventy sa dostepne przez direct URL, gdy `publicQueueEnabled=true`; `invite_required` oraz
`publicJoinEnabled=false` nie blokuja samego odczytu publicznej kolejki. Public profile routing `/@handle`
albo `/venue/[venuePublicId]` pozostaje osobnym zadaniem.

Preferowane endpointy publiczne dla uczestnika:

```txt
GET  /public/events/:eventPublicId
GET  /public/events/:eventPublicId/queue
POST /public/events/:eventPublicId/requests
GET  /public/events/:eventPublicId/my-requests
GET  /public/events/:eventPublicId/stream
```

Venue-based public API pozostaje tymczasowo jako compatibility surface, ale public-web nie linkuje juz do
venue-scoped join ani queue.

Public submit uzywa anonimowego cookie `pn_participant`. Uczestnik nie zaklada konta, token nie trafia do response body, a baza zapisuje tylko hash w `song_requests.participant_token_hash`. `PARTICIPANT_TOKEN_SECRET` sluzy do HMAC-SHA-256; jesli nie jest ustawiony, API uzywa `AUTH_SECRET` jako fallback. Dodatkowe limity antyspamowe: maksymalnie `PUBLIC_REQUEST_MAX_ACTIVE_PER_PARTICIPANT` aktywne requesty (`pending`, `approved`, `now`) per event oraz cooldown `PUBLIC_REQUEST_COOLDOWN_SECONDS` sekund per participant/event. Dotychczasowy IP+event rate limit zostaje jako fallback.

`/event/[eventPublicId]` pobiera event detail, queue i requesty uczestnika przez event-scoped API oraz linkuje
do canonical read-only queue page, gdy kolejka jest publiczna. Backend pozostaje source of truth dla visibility,
lifecycle, `publicJoinEnabled`, `publicQueueEnabled`, `joinAccessMode` i `participant_event_access`.

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
- `/sign-in` - normalne logowanie przez Google z callbackiem `/dashboard`,
- `/login` - kompatybilny alias przekierowujacy do `/sign-in`,
- `/setup` - jednorazowy first-owner setup przez `PLATFORM_SETUP_TOKEN`,
- `/dashboard` - odczyt `GET /me` i shell dostepu,
- `/dashboard/access` - stan dostepu closed beta,
- `/dashboard/organizations` - placeholder,
- `/dashboard/venues` - placeholder,
- `/dashboard/events` - D3 wybor eventu z listy dostepnych wydarzen, z manualnym eventId tylko jako fallback QA/dev,
- `/dashboard/events/new` - D5 minimalny formularz utworzenia wydarzenia,
- `/dashboard/events/:eventId/queue` - D2 operator queue MVP oraz D4 event lifecycle controls.

Login CTA nie jest zwyklym linkiem do endpointu auth. Dashboard uzywa Better Auth client flow:

```txt
authClient.signIn.social({
  provider: "google",
  callbackURL: "http://localhost:3001/dashboard"
})
```

`GoogleSignInButton` nie ma juz callbacku zakodowanego na stale. `/setup` uzywa `callbackPath="/setup"`, a `/sign-in` uzywa `callbackPath="/dashboard"`.

Lokalny Google OAuth setup wymaga `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` i `AUTH_SECRET` w API. Redirect URI w Google Console powinien wskazywac Better Auth callback API:

```txt
http://localhost:4321/auth/callback/google
```

Bez prawdziwych Google OAuth credentials lokalnie mozna zweryfikowac render i stan `authenticated=false`, ale nie nalezy raportowac pelnego OAuth smoke jako przechodzacego. Dashboard laczy `GET /setup/status` i `GET /me` w jeden gate:

- `setupRequired=true` - `/dashboard/*` kieruje do `/setup`,
- `setupRequired=false` i `authenticated=false` - `/dashboard/*` kieruje do `/sign-in`,
- `setupRequired=false`, `authenticated=true` i `dashboardAllowed=false` - `/dashboard/*` kieruje do `/dashboard/access`,
- `dashboardAllowed=true` - pokazuje shell z uzytkownikiem, rolami platformowymi i linkami do organizacji, lokali oraz wydarzen.

Pending approval / closed beta ma sens tylko po zakonczonym setupie pierwszego platform ownera. Jesli API albo setup status jest niedostepny, dashboard pokazuje system/API unavailable zamiast traktowac to jako wymagany setup.

D2 dodaje pierwszy panel operatora kolejki. Widok pobiera `GET /dashboard/events/:eventId/operator-queue`
i uzywa istniejacych endpointow mutacji:

```txt
POST /dashboard/events/:eventId/requests/:requestId/approve
POST /dashboard/events/:eventId/requests/:requestId/reject
POST /dashboard/events/:eventId/requests/:requestId/start
POST /dashboard/events/:eventId/requests/:requestId/done
POST /dashboard/events/:eventId/requests/:requestId/skip
POST /dashboard/events/:eventId/requests/:requestId/move
```

Panel pokazuje `pending`, `approved`, `now`, `done`, `rejected` i `skipped`. Nie dotyka DB bezposrednio i nie obchodzi permission layera API. Nadal nie zawiera pelnego CRUD organizacji/lokali/eventow, catalog runtime ani stats.

MVP support access: aktywny `platform_owner` moze otwierac i obslugiwac dowolna operator queue oraz dashboard event stream. To swiadomy shortcut dla first ownera/supportu po `/setup`, zeby mozna bylo obsluzyc demo event bez osobnego staff assignment UI. Docelowo trzeba rozdzielic to na audytowany support access albo impersonation.

D3 dodaje realny wybor eventu dla operatora. `/dashboard/events` pobiera `GET /dashboard/events` z Fastify API, pokazuje sekcje `Aktywne teraz`, `Nadchodzace / robocze` i `Zakonczone`, wyroznia eventy `active` oraz `paused`, a przy kazdym evencie pokazuje lokal, organizacje, status, widocznosc public join/queue oraz akcje `Otworz kolejke`. Operator nie musi znac UUID eventu jako glownego flow. Manualne otwieranie kolejki po ID zostaje na dole strony jako awaryjny fallback dla QA/dev.

D4 dodaje kontrolki lifecycle na stronie `/dashboard/events/:eventId/queue`. Operator albo `platform_owner` moze z tego samego widoku kolejki wykonac akcje `Start`, `Pauza`, `Wznow`, `Zamknij`, `Archiwizuj` i `Anuluj` zgodnie z backendowym state machine. Ten panel uzywa Fastify API:

```txt
GET   /dashboard/events/:eventId
PATCH /dashboard/events/:eventId
POST  /dashboard/events/:eventId/start
POST  /dashboard/events/:eventId/pause
POST  /dashboard/events/:eventId/resume
POST  /dashboard/events/:eventId/close
POST  /dashboard/events/:eventId/archive
POST  /dashboard/events/:eventId/cancel
```

Panel pozwala tez wlaczyc albo wylaczyc `publicJoinEnabled` i `publicQueueEnabled`. Public submit jest traktowany jako dostepny tylko dla eventu `active` z wlaczonym public join; public queue w dashboardowym modelu widocznosci jest traktowana jako live dla `active` albo `paused` z wlaczonym public queue. Backend i public API pozostaja zrodlem prawdy.

D4.1 historycznie dodalo lifecycle realtime dla venue-first join. Ten URL zostal usuniety; canonical participant flow
dziala teraz na `/event/[eventPublicId]` i korzysta z event-scoped API.

D4.2/P0 utwardza lifecycle controls przed connection starvation i wiszacymi fetchami. Strona operator queue nie otwiera juz dashboard SSE jako krytycznego kanalu; lifecycle action wykonuje POST/PATCH z timeoutem, po sukcesie robi deterministyczny refetch event detail + operator queue, a przy bledzie zawsze odblokowuje przyciski. Lista `/dashboard/events` uzywa bezpiecznego refreshu po focus/visibility zamiast streamow per event. Canonical public queue korzysta z event-scoped streamu. Stabilnosc akcji operatora ma priorytet nad idealnym realtime listy.

D4.4 dodaje safe refresh UX dla `/dashboard/events` bez EventSource per event. Lista ma reczny przycisk `Odswiez`, timestamp ostatniego odswiezenia, non-fatal error bez ukrywania starej listy, refresh po focus/visibility oraz polling co 15 sekund tylko dla widocznej karty z in-flight guardem. Operator actions dalej maja priorytet nad realtime listy. Jesli bedzie potrzebny prawdziwy realtime listy, follow-up to RT1: pojedynczy `/dashboard/events/stream` albo `/dashboard/stream`, nie stream per event.

D4.5 domyka status propagation miedzy public join i dashboard operator queue bez wracania do agresywnego SSE. `/dashboard/events/:eventId/queue` ma reczny przycisk `Odswiez kolejke`, non-fatal blad refreshu, focus/visibility refresh oraz polling co 5 sekund tylko dla widocznej karty i tylko gdy nie trwa mutacja operatora. Canonical event page sledzi status wlasnego zgloszenia przez `GET /public/events/:eventPublicId/my-requests`; endpoint uzywa cookie `pn_participant`, filtruje po hashu participant tokena, nie przyjmuje tokena w query/body i nie zwraca cudzych requestow ani plaintext tokena.

D5 dodaje minimalny flow tworzenia wydarzenia bez pelnego CRUD. `/dashboard/events` ma akcje `Nowe wydarzenie`, a `/dashboard/events/new` pobiera `GET /dashboard/venues`, pokazuje wybor lokalu, nazwe, slug, status `draft|scheduled|active`, opcjonalne daty oraz flagi `publicJoinEnabled` i `publicQueueEnabled`. Submit uzywa `POST /dashboard/events` z `credentials: include` i po sukcesie kieruje do `/dashboard/events/:eventId/queue`. Platform owner ma MVP support/admin mozliwosc tworzenia eventu dla dostepnego lokalu, a konflikt sluga jest mapowany na kontrolowany `409 EVENT_SLUG_CONFLICT`. Seed demo nie jest juz jedynym sposobem posiadania eventu, ale pelny CRUD eventow/lokali/organizacji, staff assignment UI i tworzenie venue pozostaja odroczone.

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
http://localhost:3001/dashboard/events
http://localhost:3001/dashboard/events/<eventId>/queue
```

Podstawowy flow po D3 to wejscie na `/dashboard/events` i klikniecie `Otworz kolejke`. Demo eventId mozesz znalezc w Postgresie tylko do awaryjnego fallbacku QA/dev:

```sql
select id, slug, status from events where slug = 'demo-karaoke';
```

Bez prawdziwej sesji Google OAuth panel poprawnie pokaze stan logowania/braku dostepu. D2 nie dodaje auth bypassa do lokalnego QA.
