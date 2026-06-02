# Poza Nutą — audyt liniowy aktualnego ZIP-a

Data audytu: 2026-05-29
Zakres: aktualny `poza-nuta.zip`, krytyczne pliki backendu, DB, auth, permissions, queue, SSE, public-web, tooling i dokumentacja.

Ten dokument nie zastępuje testów. To jest senior code review z konkretnymi odniesieniami `plik:linia` i decyzją, co zmienić.

## Typecheck integrity cleanup

- DONE: root `pnpm typecheck` obejmuje realnym `tsc --noEmit` targetowe workspaces (`packages/domain`, `packages/db`, `apps/api`, `packages/shared`, `apps/public-web`) oraz `tsconfig.tests.json`.
- DONE: `scripts/typecheck.mjs` jest uruchamiany jako `pnpm check:architecture`, czyli dodatkowy architecture/custom check, a nie jedyny typecheck.
- DONE: domyślne `pnpm dev` uruchamia Fastify API + Next.js public-web, a nie legacy Vite app.
- DONE: domyślne `pnpm build` buduje target public-web; legacy Vite build jest jawnie nazwany `pnpm build:web:legacy`.
- DONE: legacy runtime pozostaje jako reference przez `apps/web` i `apps/api/src/server.ts`, ale nie jest domyślnym dev/build path.
- DONE: naprawiono wskazane błędy TS z QA/dev-review: permission `.includes()`, `server.address().port`, `EventSummary.startsAt/endsAt` i response headers typing.

## Werdykt

Idziemy w dobrą stronę. Aktualny kod materializuje venue-first platformę: Postgres + Drizzle, Fastify, Better Auth, permission layer, organizations/venues/events, queue w DB, SSE i public-web Next.js.

Nie jest to jeszcze stan produkcyjny. Przed dashboard-web i realnym eventem trzeba zrobić hardening P0/P1 poniżej.

## Skala priorytetów

- `P0` — naprawić natychmiast; security/data leak/blocker.
- `P1` — naprawić przed realnym użyciem w lokalu lub przed dashboard-web, jeśli dotyka operator flow.
- `P2` — naprawić przed produkcją.
- `P3` — sprzątanie/quality.

---

## 1. Repo hygiene / artefakty / sekrety

### P0 — ZIP zawiera `.env`

- `./.env:1-12` — paczka audytowa zawiera realny `.env`, w tym `ISING_CLIENT_ID` oraz legacy `API_ADMIN_TOKEN`/`VITE_API_BASE_URL`.
- `.gitignore:1-8` ignoruje `.env`, `dist`, `.next*`, `node_modules`, ale paczka nadal je zawiera.

**Problem:** źródłowy ZIP nie może zawierać `.env`. Nawet jeśli `ISING_CLIENT_ID` jest publicznym client id, wysyłanie `.env` w paczce to zły nawyk i ryzyko późniejszego wycieku sekretów.

**Zmiana:** dodać skrypt `pack:source` oparty o `git archive` albo `tar --exclude`, i zakazać ręcznego zipowania katalogu roboczego.

### P0 — ZIP zawiera generated artifacts

W paczce są:

- `apps/public-web/node_modules` — ok. 17k plików, ok. 157 MB.
- `apps/public-web/.next`, `.next-build`, `.next-public` — build artifacts.
- `dist/` — legacy build output.

**Problem:** audyt i deployment source package robią się brudne. Można przypadkowo wrzucić cache/build artefakty do PR-a albo paczki.

**Zmiana:** dodać `scripts/check-clean-package.mjs`, który failuje, jeśli znajdzie `node_modules`, `.next`, `.next-build`, `.next-public`, `dist`, `coverage`, `.turbo` poza dozwolonymi miejscami. Podpiąć do CI.

### P1 — brak Dockerfile API/worker mimo decyzji Docker policy

- W repo nie ma `apps/api/Dockerfile` ani `apps/worker/Dockerfile`.
- Checklist pierwotnie wymagał Dockerfile dla API/workera.

**Problem:** Railway może buildować bez Dockerfile, ale decyzja architektoniczna mówiła o przenośności API/workera.

**Zmiana:** dodać Dockerfile dla API i workera przed Phase 15/deployment.

---

## 2. DB schema — `packages/db/src/schema.ts`

### P0 — niespójne defaulty ról

- `packages/db/src/schema.ts:27` — dozwolone `venueAccessRoles`: `owner`, `manager`, `event_creator`, `karaoke_operator`, `viewer`.
- `packages/db/src/schema.ts:213` — default `venue_organization_access.role = "operator"`, czyli wartość spoza listy.

**Problem:** row utworzony bez roli będzie miał rolę, której permission layer nie zna. To cichy bug autoryzacji.

**Zmiana:** default zmienić na `karaoke_operator` albo usunąć default i wymagać jawnej roli. Dodać test/migrację.

### P0 — niespójny default event staff role

- `packages/db/src/schema.ts:30` — dozwolone `eventStaffRoles`: `lead_host`, `host`, `queue_operator`, `viewer`.
- `packages/db/src/schema.ts:273` — default `event_staff_assignments.role = "operator"`, czyli wartość spoza listy.

**Problem:** analogiczny bug. Permission layer nie rozpozna `operator` jako event staff role.

**Zmiana:** default zmienić na `queue_operator` albo usunąć default. Dodać migrację/test.

### P1 — statusy i role są `text` bez DB constraints

Przykłady:

- `users.status` — `schema.ts:134`
- `platform_memberships.role/status` — `schema.ts:145-146`
- `organizations.type/status` — `schema.ts:160-161`
- `organization_memberships.role/status` — `schema.ts:175-176`
- `venues.status/verificationStatus` — `schema.ts:194-195`
- `events.status` — `schema.ts:244`
- `song_requests.status` — `schema.ts:350`
- `queue_events.type` — `schema.ts:381`

**Problem:** TypeScript stałe chronią tylko kod. Baza przyjmie `status='banana'`.

**Zmiana:** przed produkcją dodać check constraints albo pg enums. Minimum: event status, song request status, queue event type, role/status membershipów.

### P1 — `venueStatuses` nie odpowiada briefowi

- `schema.ts:25` — `venueStatuses = ["draft", "active", "archived"]`.
- Brief zakładał raczej `active`, `hidden`, `suspended`, `archived`/podobne.

**Problem:** `draft` może być OK dla tworzenia, ale brakuje `hidden/suspended`. Public visibility jest obecnie zrobione przez `status=active && verificationStatus=verified`, więc da się żyć, ale model jest zbyt ubogi.

**Zmiana:** doprecyzować venue lifecycle i dodać statusy przed produkcją.

### P1 — `song_requests.source_track_id` jest NOT NULL, ale public submit pozwala brak ID

- `schema.ts:345` — `sourceTrackId` `.notNull()`.
- `apps/api/src/modules/queue/service.ts:184` — jeśli brak `sourceTrackId`, zapisuje pusty string.
- `apps/public-web/components/JoinForm.tsx:72-75` — `ID utworu` jest opcjonalne.

**Problem:** pusty string jako identyfikator utworu to semantyczny brud. Będzie bolało przy katalogu/search.

**Zmiana:** albo `sourceTrackId` nullable, albo dodać źródło `manual` i jawny sentinel, albo wymagać wyboru tracka z katalogu. Na teraz najlepsze: nullable + test.

### P1 — brak unique approved position per event

- `schema.ts:358-364` ma unique tylko dla `now` per event.
- Nie ma unique/index constraintu typu `(event_id, position) where status='approved'`.

**Problem:** dwa równoległe approve/move mogą nadać tę samą pozycję.

**Zmiana:** dodać partial unique index dla `approved` positions albo lock per event/queue. Najlepiej oba: DB constraint + retry/409 mapping.

### P2 — catalog import counters są słabsze niż brief

- `schema.ts:399-407` ma `totalFoundFromSource`, `importedCount`, `skippedCount`, `errorCount`.
- Brief zakładał bardziej użyteczne `inserted/updated/unchanged/unavailable/error`.

**Problem:** przy iSing/KaraFun debug importów będzie słabszy.

**Zmiana:** przy Phase 13 przebudować counters import run.

---

## 3. Queue service — `apps/api/src/modules/queue/service.ts`

### Dobre linie / poprawny kierunek

- `service.ts:139-147` — `assertPublicQueueVisible()` centralizuje public queue visibility. Dobrze.
- `service.ts:169-203` — public submit zapisuje request i `queue_events`. Dobrze.
- `service.ts:226-252` — approve działa transakcyjnie i publikuje event. Dobrze.
- `service.ts:286-316` — start blokuje drugi `now`. Dobrze.
- `service.ts:546-567` — queue audit idzie przez `queue_events`. Dobrze.
- `service.ts:589-597` — public item nie zawiera `note`. Dobrze.

### P1 — closed event jest public queue visible

- `service.ts:131` — `publicQueueVisibleStatuses = ["active", "paused", "closed"]`.

**Problem:** to oznacza, że bezpośredni event UUID pozwala zobaczyć public queue snapshot po `closed`, jeśli `publicQueueEnabled=true`. Może to być świadoma historia, ale nie było to jasno ustalone. Public active-event flow i tak zwraca tylko active/paused.

**Zmiana:** zdecydować: czy closed queue ma być public archive? Jeśli nie, usuń `closed`. Jeśli tak, udokumentuj i dodaj osobny endpoint/history policy.

### P1 — approve position race

- `service.ts:234-238` — pozycja = `approved.length + 1`.
- `service.ts:528-534` — approved list bez lockowania.
- `service.ts:540-543` — sekwencyjny rewrite pozycji.

**Problem:** równoległe operacje mogą zrobić duplikaty pozycji albo przeskoki.

**Zmiana:** dodać partial unique index dla approved positions i/lub lock kolejki per event w transakcji. Mapować unique violation na `409 CONFLICT`.

### P1 — `paused` pozwala na mutacje operatora

- `service.ts:132` — `mutableQueueStatuses = ["active", "paused"]`.
- `service.ts:459-463` — mutacje operatora allowed dla active/paused.

**Problem:** to jest OK tylko jeśli `paused` znaczy: public submit off, operator dalej może pracować. Trzeba to jawnie zapisać w brief/checklist.

**Zmiana:** dodać definicję: `paused = submissions disabled, operator mutations allowed` albo wprowadzić osobny frozen status.

### P1 — `sourceTrackId ?? ""`

- `service.ts:184` — pusty string zamiast braku track ID.

**Problem:** patrz schema finding.

**Zmiana:** nullable albo manual source.

### P2 — repeated `rows.find` dla now

- `service.ts:219` — `rows.find(...)` jest wywołane dwa razy.

**Problem:** mały quality issue.

**Zmiana:** przypisać do `const current = rows.find(...)`.

---

## 4. Queue routes — `apps/api/src/modules/queue/routes.ts`

### Dobre linie

- `routes.ts:15-27` — public stream sprawdza event i `assertPublicQueueVisible`. Dobrze.
- `routes.ts:34-46` — public submit ma rate limit. Dobrze jako MVP.
- `routes.ts:139-154` — operator stream/action checks używają permission layera. Dobrze.

### P1 — public endpoints nadal używają event UUID jako `eventPublicId`

- `routes.ts:15-16`, `routes.ts:29-31`, `routes.ts:47-49` — `eventPublicId` jest walidowany jako UUID.
- `apps/public-web/lib/apiClient.ts:129-147` buduje URL-e po event ID.

**Problem:** produkt jest venue-first, a public API nadal wymaga event UUID po active-event lookup. To działa, ale nie jest docelowe.

**Zmiana:** dodać venue-first endpointy:

```txt
GET  /public/venues/:venueSlug/queue
POST /public/venues/:venueSlug/requests
GET  /public/venues/:venueSlug/stream
```

Backend sam rozwiązuje active/paused event.

### P1 — rate limit tylko IP + event

- `routes.ts:37-43` — limit `5/min` po `request.ip:eventId`.

**Problem:** w barze wiele osób może siedzieć za jednym NAT-em. Jednocześnie pojedynczy spammer może obejść limit.

**Zmiana:** dodać participant cookie/token i użyć `participantTokenHash`. Polityka: max pending per participant/event + IP fallback.

---

## 5. Event service/routes

### Dobre linie

- `events/service.ts:103-110` — lifecycle transitions są jawne. Dobrze.
- `events/service.ts:214-256` — lifecycle w transakcji + `queue_events` + SSE publish. Dobrze.
- `events/service.ts:357-392` — public active event lookup po venueSlug. Dobrze.

### P0 — staff assignment mutation nie weryfikuje, czy assignment należy do eventu z URL

- `events/routes.ts:144-165` — route ma `eventId` i `assignmentId`, ale przekazuje tylko `assignmentId` do service.
- `events/service.ts:299-318` — `patchStaffAssignment(assignmentId, input)` aktualizuje po samym assignment ID.
- `events/service.ts:321-323` — delete/removal też działa po samym assignment ID.

**Problem:** user z `event.manage` na evencie A może potencjalnie zmodyfikować assignment z eventu B, jeśli zna `assignmentId`. To jest realny błąd autoryzacji.

**Zmiana:** service musi przyjmować `eventId` i robić `WHERE id = assignmentId AND event_id = eventId`. Dodać test regresji.

### P1 — lifecycle race / brak explicit row lock

- `events/service.ts:217` — `getEventForUpdate()` nazwane jak lock, ale `events/service.ts:412-419` robi zwykły select bez `FOR UPDATE`.
- `events/service.ts:225-226` sprawdza running event przed update, a DB unique constraint łapie finalnie wyścig.

**Problem:** DB unique ratuje spójność, ale raw unique error może wyciec jako 500/nieładny błąd.

**Zmiana:** mapować unique violation na `409 CONFLICT` i/lub użyć explicit locking, jeśli Drizzle pozwoli.

### P1 — `startsAt`/`endsAt` bez walidacji kolejności

- `events/routes.ts:57-58` czyta daty.
- `events/service.ts:158-159`, `events/service.ts:180-184` zapisują daty bez sprawdzenia `endsAt > startsAt`.

**Problem:** można stworzyć event kończący się przed startem.

**Zmiana:** walidacja w service: jeśli oba są podane, `endsAt > startsAt`.

### P2 — `patchStaffAssignment` może ustawić `role` bez ponownej walidacji active membership

- `events/routes.ts:151-154` waliduje role/status enum.
- `events/service.ts:299-318` nie weryfikuje event context ani membership.

**Problem:** po naprawie P0 warto w service centralnie walidować assignment invariants, nie tylko route.

---

## 6. Permissions

### Dobre linie

- `permissions/definitions.ts:1-80` — permission constants i role mapping są czytelne.
- `permissions/service.ts:84-102` — event permission sprawdza membership + venue access + event staff. Dobrze.
- `permissions/request.ts:42-49` — `requireActiveCurrentUser`. Dobrze.

### P1 — platform role omija user disabled status w request helperze platformowym?

- `permissions/request.ts:51-57` używa `requireCurrentUser`, który blokuje `disabled` w `request.ts:35-37`. OK.

**Werdykt:** tu jest dobrze. Nie ruszać bez potrzeby.

### P2 — `hasVenuePermission` nie daje platform override

- `permissions/service.ts:79-82` sprawdza tylko venue access, bez platform role.

**Problem:** route’y obecnie ręcznie sprawdzają platform override. To działa, ale wymaga konsekwencji.

**Zmiana:** albo zostawić pattern i dokumentować, albo dodać osobne helpery `hasVenueOrPlatformPermission`.

---

## 7. Auth

### Dobre linie

- `auth/betterAuth.ts:6-36` — Better Auth jest w API, basePath `/auth`, trusted origins, Drizzle adapter. Dobrze.
- `auth/domainUsers.ts:19-93` — mapowanie auth user -> domenowy user. Dobrze.
- `auth/domainUsers.ts:95-110` — idempotentny platform owner grant. Dobrze.

### P2 — dev Google credentials defaultują do `replace_me`

- `config.ts:38-39` — w non-production brak Google env daje `replace_me`.

**Problem:** OK dla testów, ale dev login przez Google nie zadziała bez jawnej konfiguracji. Może mylić.

**Zmiana:** README jasno: do realnego OAuth ustaw Google env; smoke `/me` bez sesji działa bez tego.

### P2 — `AUTH_SECRET` fallback w development

- `config.ts:22`, `config.ts:37` — dev fallback secret.

**Problem:** OK lokalnie, ale każdy env nieprodukcyjny z `NODE_ENV!=production` może przypadkiem użyć stałego secreta.

**Zmiana:** dla staging/preview wymagać jawnego `AUTH_SECRET`, np. przez `REQUIRE_STRICT_ENV=true` albo `NODE_ENV=production` na deployu.

---

## 8. SSE

### Dobre linie

- `eventBus.ts:49-94` — prosty in-memory bus. Adekwatny na jedną instancję.
- `eventStreams.ts:22-34` — unsubscribe na close. Dobrze.
- `plugins/sse.ts:19-24` — właściwe SSE headers. Dobrze.

### P2 — in-memory bus tylko dla jednej instancji

- `eventBus.ts:49-94`.

**Problem:** przy wielu instancjach Railway/Vercel/API event z instancji A nie dotrze do klienta na instancji B.

**Zmiana:** zostawić teraz, ale dodać ADR follow-up: Redis pub/sub albo Postgres LISTEN/NOTIFY przed scalingiem API poziomo.

### P2 — brak obsługi backpressure/write errors

- `eventStreams.ts:22-28` pisze do `reply.raw` bez try/catch.

**Problem:** przy zerwanym połączeniu może polecieć błąd streamu. Testy cleanup są, ale warto dodać defensywne try/catch.

---

## 9. Public-web

### Dobre linie

- `apiClient.ts:111-130` — browser API base i stream URL. OK.
- `serverApiClient.ts:16-18` — `API_INTERNAL_URL || NEXT_PUBLIC_API_URL || DEFAULT_API_URL`. Dobrze.
- `queue/page.tsx:31-44` — active event lookup -> queue fetch. OK.
- `PublicQueueView.tsx:22-55` — EventSource + cleanup. OK.
- `metadata.ts:24-35` — join/queue noindex. Dobrze.

### P1 — literówki/brak polskich znaków w join visibility/page

- `join/page.tsx:53-65` — `Zgloszenia sa`, `Zglos`, `Wypelnij`, `wroci`.
- `joinVisibility.ts:16` — `Zgloszenia piosenek sa teraz zamkniete.`.

**Problem:** publiczny UI wygląda tanio.

**Zmiana:** poprawić polskie znaki.

### P1 — public form opiera się na manualnym source/track

- `JoinForm.tsx:57-75` — użytkownik wybiera `sourceId` i opcjonalnie wpisuje `ID utworu`.

**Problem:** to dobre tylko jako MVP techniczny. Dla realnego usera w lokalu to słaby UX.

**Zmiana:** Phase 13/po katalogu: search + wybór tracka. Do tego czasu UI musi jasno mówić, że to tryb ręczny/demo.

### P2 — `statusLabel` w PublicQueueView jest mylący

- `PublicQueueView.tsx:121-124` — `stale` pokazuje `Łączenie`, `connecting` pokazuje `Start`.

**Problem:** jeśli stream padł, użytkownik widzi „Łączenie”, a nie „Offline/odśwież ręcznie”.

**Zmiana:** `connected=Live`, `connecting=Łączenie`, `stale=Połączenie przerwane`.

---

## 10. Public venue visibility

### Dobre

- `venues/service.ts:285-287` — public venue musi być `active + verified`.
- `venues/routes.ts:21-30` — public venue endpoint respektuje visibility.
- `events/service.ts:357-374` — active-event lookup respektuje visibility.

### P2 — public queue po event UUID omija venue slug flow

- `queue/routes.ts:29-31` bierze event UUID i nie wymaga venue slug.
- `queue/service.ts:428-449` joinuje event z venue, ale nie sprawdza venue public visibility.

**Problem:** jeśli ktoś zna event UUID venue, które później stało się hidden/unverified, public queue endpoint może nadal działać, jeśli event ma `publicQueueEnabled=true` i status visible.

**Zmiana:** `getPublicQueue` powinno sprawdzać venue public visibility albo nowe venue-based endpointy powinny być jedyną publiczną ścieżką.

---

## 11. Legacy code

### P2 — legacy app/API nadal obecne

- `apps/api/src/server.ts` — legacy `node:http`.
- `apps/web` — legacy Vite app.
- `src/queue`, `src/search`, `src/importers` — wartościowe reference.

**Problem:** jeszcze OK, ale po dashboard/catalog trzeba usunąć lub przenieść. Nie wolno rozwijać dwóch produktów.

**Zmiana:** po Phase 12/13: migration cleanup ADR i usunięcie legacy runtime z default dev flow.

---

## 12. Najważniejsze poprawki do wykonania przed Dashboard Web

### H1 — P0 source hygiene

- Usunąć `.env`, `node_modules`, `.next*`, `dist` z paczek/source ZIP.
- Dodać `scripts/check-clean-package.mjs`.
- Dodać `pack:source`.

### H2 — P0 event staff route security

- Zmienić `patchStaffAssignment(eventId, assignmentId, input)` i `removeStaffAssignment(eventId, assignmentId)`.
- WHERE musi zawierać `event_id = eventId`.
- Dodać test: manager eventu A nie może modyfikować staff assignment eventu B.

### H3 — P0 role defaults migration

- `venue_organization_access.role`: `operator` -> `karaoke_operator` albo brak defaultu.
- `event_staff_assignments.role`: `operator` -> `queue_operator` albo brak defaultu.
- Dodać DB migration i testy.

### Resolved in hardening patch H1-H3

- H1: dodano `scripts/check-clean-package.mjs`, `pnpm check:clean-package` i `pnpm pack:source`; `.gitignore` obejmuje `.env`, `node_modules`, `.next*`, `dist`, `build`, `coverage`, `.turbo`, lokalne JSON-y runtime i dumpy.
- H2: `patchStaffAssignment(eventId, assignmentId, input)` oraz `removeStaffAssignment(eventId, assignmentId)` sprawdzają przynależność assignmentu do eventu z URL i zwracają `404 NOT_FOUND` przy mismatchu.
- H3: default `venue_organization_access.role` zmieniono na `karaoke_operator`, default `event_staff_assignments.role` zmieniono na `queue_operator`; migracja aktualizuje też istniejące błędne wartości `operator`.

### H4 — P1 queue public identity

- DONE: dodano venue-first public queue endpoints:
  - `GET /public/venues/:venueSlug/queue`
  - `POST /public/venues/:venueSlug/requests`
  - `GET /public/venues/:venueSlug/stream`
- Public-web używa venueSlug endpoints dla podstawowego join/queue flow: snapshot, submit i stream nie wymagają już event UUID.
- Event UUID endpoints zostały zachowane jako tymczasowe event-specific compatibility API.
- Dla lokalu bez active/paused eventu `GET /public/venues/:venueSlug/queue` zwraca stabilny inactive shape z `activeEvent: null`, pustą kolejką i `submissions.enabled=false`.

### H5 — P1 participant anti-spam

- DONE: public submit używa anonimowego cookie `pn_participant`.
- Token jest losowy, HttpOnly/SameSite=Lax i nie trafia do response body.
- DB zapisuje tylko hash tokena w `song_requests.participant_token_hash`.
- Dodano max aktywnych requestów per participant/event oraz cooldown per participant/event.
- IP+event rate limit został jako fallback, ale nie jest już jedyną ochroną.

### H6 — P1 queue concurrency

- RESOLVED: dodano partial unique index `song_requests_one_approved_position_per_event_unique`
  na `(event_id, position)` dla `status='approved' and position is not null`.
- RESOLVED: mutacje kolejki są serializowane per event przez `pg_advisory_xact_lock` w transakcji.
- RESOLVED: unique violations dla `one now` i `approved position` są mapowane na kontrolowany `409 CONFLICT`.
- RESOLVED: approve/reject/start/skip/move normalizują approved queue do pozycji `1..n`.

### Local QA demo data — DEV TOOL

- DONE: dodano `pnpm db:seed:demo` jako lokalny seed dla ręcznego QA public-web.
- Seed tworzy idempotentnie organizację `poza-nuta-demo`, lokal `demo-klub`, aktywny event `demo-karaoke` i realistyczny snapshot kolejki.
- Demo lokal spełnia public visibility policy (`venue.status=active`, `verification_status=verified`), więc adresy `/demo-klub`, `/demo-klub/join` i `/demo-klub/queue` mogą działać po migracjach i seedzie.
- Seed nie tworzy prawdziwych userów auth ani sekretów.

### SSE CORS for public queue stream — BUGFIX

- RESOLVED: SSE helper dodaje `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials` i `Vary: Origin` dla allowlistowanych originów.
- Public streamy `/public/venues/:venueSlug/stream` i `/public/events/:eventPublicId/stream` działają dla `http://localhost:3000`.
- Dashboard stream działa dla `DASHBOARD_WEB_URL`.
- Unsupported origin nie dostaje wildcarda ani allow-origin headera.

### H7 — P1 DB status constraints

- Dodać check constraints dla statusów/ról krytycznych.

---

## 13. Decyzja: czy iść dalej?

Tak, ale nie od razu w pełny dashboard.

Rekomendowana kolejność:

1. H1 source hygiene.
2. H2 staff assignment security.
3. H3 invalid role defaults.
4. H4 venue-first public queue endpoints.
5. H5 participant anti-spam foundation.
6. H6 queue concurrency hardening.
7. Dopiero potem Phase 12 dashboard-web MVP.

H1-H6 są zamknięte. Dashboard-web D1 foundation i D2 operator queue MVP zostały rozpoczęte jako bezpieczny dashboard workflow bez CRUD, katalogu runtime ani stats.

### Dashboard-web D1/D2 foundation — DONE/PARTIAL

- DONE: `apps/dashboard-web` jest realną aplikacją Next.js App Router.
- DONE: lokalny dashboard działa na `http://localhost:3001` przez `pnpm dev:dashboard`.
- DONE: root `pnpm dev` uruchamia API, public-web i dashboard-web.
- DONE: root `pnpm build` buduje public-web i dashboard-web.
- DONE: root `pnpm typecheck` obejmuje `apps/dashboard-web`.
- DONE: `/login` kieruje do Better Auth API pod `/auth/sign-in/social?provider=google`.
- DONE: `/dashboard` wywołuje `GET /me` przez Fastify API z `credentials: include`.
- DONE: dashboard rozróżnia `authenticated=false`, `dashboardAllowed=false` i `dashboardAllowed=true`.
- DONE: `/dashboard/events` pozwala manualnie otworzyć kolejkę po eventId.
- DONE: `/dashboard/events/[eventId]/queue` pobiera operator queue z Fastify API.
- DONE: operator queue UI pokazuje pending/approved/now/done/rejected/skipped.
- DONE: operator queue UI obsługuje approve/reject/start/done/skip/move przez istniejące endpointy.
- DONE: dashboard stream SSE robi refetch po `queue.updated`, `request.*` i `event.*`.
- TODO: CRUD organizacji/lokali/eventów.
- TODO: platform access request UI.
- TODO: catalog runtime i stats.

Kolejne dashboard tasks powinny iść etapami: najpierw brakujące event/organization/venue CRUD i platform/admin views, potem catalog runtime albo stats dopiero w osobnych fazach.
