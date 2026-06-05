# Poza Nutą — Typecheck Integrity, Repo Cleanup & Legacy Retirement Brief

> Cel: naprawić problemy wykryte podczas QA/dev-review przed H6, dashboardem i dalszym rozwojem.
>
> To nie jest feature task. To jest porządkowanie fundamentu, żeby projekt przestał udawać, że jest type-safe, kiedy edytor pokazuje realne błędy.

---

## 1. Aktualny kontekst

Projekt ma już wykonane główne fundamenty:

- pnpm workspace,
- ADR-y,
- PostgreSQL + Drizzle,
- Fastify API,
- Better Auth + Google OAuth foundation,
- permission layer,
- organizations/venues,
- events lifecycle,
- Postgres-backed queue,
- SSE,
- Next.js public-web,
- venue-first public queue endpoints,
- participant token + anti-spam,
- source package hygiene.

QA potwierdziło:

```txt
API /health                  OK, db.ok=true
Postgres tables              OK
song_sources                 OK, ising + karafun
public-web root              OK
hydration warning            NIE jest bugiem aplikacji; powodowało go browser extension
pnpm lint                    OK
pnpm test                    OK, 190/190
pnpm build:public            OK
pnpm smoke:api               OK po zwolnieniu portu albo API_PORT override
pnpm check:clean-package     OK
pnpm pack:source             OK
```

Jednocześnie QA/dev-review wykryło:

```txt
pnpm typecheck przechodzi, ale edytor/tsserver pokazuje realne błędy TS.
```

To oznacza, że obecny typecheck nie obejmuje całego repo albo nie robi pełnego `tsc` dla krytycznych części.

---

## 2. Najważniejszy problem: `pnpm typecheck` jest niepełny

Obecny root script:

```json
"typecheck": "node --experimental-strip-types scripts/typecheck.mjs && tsc -p apps/web/tsconfig.json --noEmit && pnpm --filter @poza-nuta/public-web typecheck"
```

Problem:

```txt
node --experimental-strip-types NIE robi pełnego TypeScript typechecku.
```

To tylko uruchamia pliki `.ts` po zdjęciu typów. To nie zastępuje `tsc --noEmit`.

Obecnie nie ma pewności, że pełnym `tsc` sprawdzane są:

```txt
apps/api
packages/db
packages/domain
packages/shared
tests
```

Efekt:

```txt
CI/typecheck mówi OK,
edytor pokazuje błędy,
czyli pipeline kłamie.
```

To trzeba naprawić przed H6 i dashboardem.

---

## 3. Błędy TS zauważone przez QA

### 3.1. Permission `.includes()` zawęża typy do złej unii albo `never`

Problemowy styl:

```ts
export function hasPlatformRolePermission(role: string, permission: PlatformPermission): boolean {
  return isPlatformRole(role) && platformRolePermissions[role].includes(permission)
}

export function hasOrganizationRolePermission(role: string, permission: OrganizationPermission): boolean {
  return isOrganizationRole(role) && organizationRolePermissions[role].includes(permission)
}
```

Błąd przykładowy:

```txt
Nie można przypisać argumentu typu
"platform.manage_access" | "platform.manage_catalog" | ...
do parametru typu
"platform.manage_access" | "platform.manage_organizations" | "platform.manage_venues".
```

oraz:

```txt
Nie można przypisać argumentu typu
"organization.manage_members" | ...
do parametru typu never.
```

Przyczyna:

```txt
TypeScript widzi role permissions jako literalne tuple/const arrays.
Dla .includes() na unionie takich tablic argument bywa zawężany do części wspólnej albo never.
```

Naprawa:

Mapowania ról powinny być jawnie typowane jako:

```ts
Record<Role, readonly Permission[]>
```

Przykład:

```ts
export const platformRolePermissions = {
  platform_owner: [
    "platform.manage_access",
    "platform.manage_catalog",
    "platform.manage_organizations",
    "platform.manage_venues",
  ],
  platform_admin: [
    "platform.manage_access",
    "platform.manage_organizations",
    "platform.manage_venues",
  ],
} satisfies Record<PlatformRole, readonly PlatformPermission[]>

export function hasPlatformRolePermission(role: string, permission: PlatformPermission): boolean {
  if (!isPlatformRole(role)) {
    return false
  }

  const permissions: readonly PlatformPermission[] = platformRolePermissions[role]
  return permissions.includes(permission)
}
```

Analogicznie dla:

```txt
organizationRolePermissions
venueAccessRolePermissions
eventStaffRolePermissions
```

Usunąć zbędne rzutowania typu:

```ts
permission as EventPermission
```

chyba że jest naprawdę konieczne i opisane komentarzem.

---

### 3.2. `server.address().port` bez narrowingu

Błąd:

```txt
Właściwość "port" nie istnieje w typie "string | AddressInfo".
```

`server.address()` zwraca:

```ts
string | AddressInfo | null
```

Naprawa:

```ts
import type { AddressInfo } from "node:net"

const address = server.address()

if (!address || typeof address === "string") {
  throw new Error("Expected TCP server address")
}

const port = address.port
```

Albo helper:

```ts
function getServerPort(server: { address(): string | AddressInfo | null }): number {
  const address = server.address()

  if (!address || typeof address === "string") {
    throw new Error("Expected server to listen on a TCP port")
  }

  return address.port
}
```

---

### 3.3. `EventSummary.startsAt/endsAt` miesza `string | Date | null`

Błąd:

```txt
startsAt: string | Date | null nie pasuje do Date | null
```

Zasada:

```txt
Service/domain model: Date | null
HTTP JSON response: string | null
```

Naprawa:

```ts
function toDateOrNull(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null
  }

  return value instanceof Date ? value : new Date(value)
}
```

Przy patchowaniu eventu:

```ts
startsAt: input.startsAt === undefined ? event.startsAt : toDateOrNull(input.startsAt),
endsAt: input.endsAt === undefined ? event.endsAt : toDateOrNull(input.endsAt),
```

Nie rozwadniać `EventSummary` do:

```ts
string | Date | null
```

---

### 3.4. `inject.Response.headers` ma za wąski typ

Błąd:

```txt
OutgoingHttpHeaders może zawierać number,
a helper oczekuje tylko string | string[] | undefined.
```

Node headers mogą mieć:

```ts
string | number | string[] | undefined
```

Naprawa:

```ts
import type { OutgoingHttpHeaders } from "node:http"

function getHeader(response: { headers: OutgoingHttpHeaders }, name: string): string | string[] | undefined {
  const value = response.headers[name.toLowerCase()]

  if (typeof value === "number") {
    return String(value)
  }

  return value
}
```

Albo prostsze typowanie test helpera:

```ts
Record<string, string | number | string[] | undefined>
```

---

## 4. Package.json — co jest dobre, a co wymaga poprawy

Dobre elementy:

```txt
pnpm workspace
db:* scripts
smoke:api
check:clean-package
pack:source
Biome
dev:api
dev:public
build:public
```

Problem:

```json
"dev": "concurrently -k -n API,WEB -c blue,magenta \"pnpm dev:api\" \"pnpm dev:web\"",
"build:web": "vite build --config apps/web/vite.config.ts",
"dev:web": "vite --config apps/web/vite.config.ts --host 127.0.0.1"
```

Po Phase 11 głównym public frontendem jest:

```txt
apps/public-web
```

a `apps/web` jest legacy Vite app.

Domyślny `dev` nie powinien już uruchamiać legacy Vite.

Docelowo:

```json
{
  "dev": "concurrently -k -n API,PUBLIC -c blue,magenta \"pnpm dev:api\" \"pnpm dev:public\"",
  "dev:legacy": "concurrently -k -n API_LEGACY,WEB_LEGACY -c yellow,gray \"pnpm dev:api:legacy\" \"pnpm dev:web:legacy\"",
  "dev:web:legacy": "vite --config apps/web/vite.config.ts --host 127.0.0.1",
  "build": "pnpm build:public",
  "build:public": "pnpm --filter @poza-nuta/public-web build",
  "build:web:legacy": "vite build --config apps/web/vite.config.ts"
}
```

Jeśli API dostanie build script później:

```json
"build": "pnpm build:api && pnpm build:public"
```

Na teraz nie wymyślać API build, jeśli nie jest gotowy.

---

## 5. Vitest — nie dodawać teraz

Obecny test script:

```json
"test": "node --experimental-strip-types --test tests/*.test.ts"
```

To jest OK na obecnym etapie.

Node test runner wystarcza dla aktualnych service/API/domain tests.

Nie dodawać Vitesta tylko dlatego, że jest popularny. Problemem nie jest test runner. Problemem jest brak pełnego `tsc`.

Vitest można rozważyć później, jeśli będą:

```txt
component tests,
watch mode jako realna potrzeba,
coverage/reporting w CI,
skomplikowane mocki.
```

---

## 6. Legacy — co porządkować

### `apps/web`

`apps/web` to legacy Vite prototype.

Docelowo do usunięcia, ale nie kasować ślepo, jeśli testy nadal go potrzebują.

Plan:

```txt
1. Zmień scripts na dev:web:legacy / build:web:legacy.
2. Upewnij się, że public-web tests pokrywają nowe flow.
3. Zidentyfikuj testy zależne od apps/web.
4. Przenieś wartościowe testy/helpers do public-web albo usuń jako legacy.
5. Dopiero potem usuń apps/web.
```

### `apps/api/src/server.ts`

Legacy node:http API.

Fastify jest target architecture.

Można usunąć, gdy:

```txt
legacy API tests zostaną usunięte albo przepisane na Fastify,
stare CLI/testy nie potrzebują node:http server,
README nie promuje dev:api:legacy.
```

Na teraz przynajmniej oznaczyć jako legacy i nie odpalać domyślnie.

### `dist/`

Build output. Nie powinien być source code.

Jeśli śledzony przez git:

```bash
git rm -r dist
```

Jeśli nieśledzony, upewnić się, że `.gitignore` go obejmuje.

### `data/`

`data/events` było runtime JSON storage dla MVP. Docelowo out.

`data/imports/ising-songs.json` może nadal być fixture dla testów search/import.

Plan:

```txt
data/events -> usunąć albo przenieść do tests/fixtures/legacy-queue
data/imports -> przenieść do tests/fixtures/ising
data jako runtime storage -> usunąć z target architecture
```

Nie usuwać, jeśli testy nadal tego potrzebują. Najpierw przenieść fixtures.

### Root `scripts/`

Nie usuwać całego folderu.

Root `scripts/` ma sens dla repo-level tooling:

```txt
scripts/check-clean-package.mjs
scripts/typecheck.mjs albo check-architecture.mjs
```

Ale `scripts/typecheck.mjs` nie może udawać TypeScript checkera.

Jeśli zostaje, nazwać rolę jasno:

```txt
check:architecture
```

albo używać jako dodatkowy custom check obok prawdziwego `tsc`.

---

## 7. Test location

Docelowo lepszy układ:

```txt
apps/api/src/modules/queue/
  service.ts
  routes.ts
  service.test.ts
  routes.test.ts

apps/api/src/modules/events/
  service.ts
  routes.ts
  service.test.ts

packages/domain/src/permissions/
  definitions.ts
  definitions.test.ts

apps/public-web/lib/
  apiClient.ts
  apiClient.test.ts
```

Root `tests/` zostawić dla:

```txt
tests/integration
tests/e2e
tests/fixtures
tests/legacy
```

Nie przenosić wszystkich testów w tym samym kroku co typecheck cleanup.

---

## 8. Kolejność senior

Nie robić emocjonalnego „wywalmy foldery”.

Kolejność:

```txt
R1. Typecheck integrity patch
R2. Root package scripts cleanup
R3. Legacy marking / target-vs-legacy split
R4. Dev demo seed dla QA
R5. H6 queue concurrency hardening
R6. Dashboard-web MVP
R7. Test relocation / legacy removal
```

---

## 9. Prompt dla Codexa

Skopiuj poniższy prompt do Codexa.

```text
Pracujesz w repozytorium Poza Nutą.

Przed zmianami przeczytaj:

/docs/POZA_NUTA_CODEX_BRIEF.md
/docs/POZA_NUTA_IMPLEMENTATION_CHECKLIST.md
/docs/POZA_NUTA_LINE_BY_LINE_AUDIT.md

Aktualny problem QA/dev-review:

1. `pnpm typecheck` przechodzi, ale edytor/tsserver pokazuje realne błędy TypeScript w:
   - permission definitions `.includes()`,
   - tests/api.test.ts server.address().port,
   - tests/events-lifecycle.test.ts EventSummary startsAt/endsAt,
   - tests/postgres-queue.test.ts response headers typing.

2. Root package.json nadal miesza legacy Vite app i nowy public-web:
   - `dev` odpala legacy apps/web,
   - `build:web` buduje legacy Vite,
   - apps/web nadal istnieje mimo że apps/public-web jest docelową aplikacją publiczną.

3. Repo ma legacy elementy:
   - apps/web,
   - apps/api/src/server.ts,
   - data/events JSON storage,
   - część testów legacy,
   - root scripts mieszające legacy i target architecture.

CEL TEGO KROKU

Zrób repo/typecheck cleanup bez budowania nowych funkcji.

Priorytet:

1. pełny typecheck ma realnie obejmować apps/api, packages/db, packages/domain, packages/shared, apps/public-web i testy,
2. napraw błędy TS pokazywane przez edytor bez używania `any`,
3. uporządkuj package scripts, żeby domyślne `dev` i `build` szły w target architecture, nie legacy,
4. przygotuj legacy retirement w małym, bezpiecznym zakresie.

NIE implementuj dashboard-web.
NIE implementuj H6 queue concurrency.
NIE implementuj catalog runtime.
NIE dodawaj Vitest.
NIE dodawaj nowych technologii.
NIE rób masowego przenoszenia wszystkich testów obok plików w tym kroku.
NIE kasuj legacy bez zachowania/przeniesienia potrzebnych testów.

CZĘŚĆ A — Typecheck integrity

1. Dodaj/napraw tsconfigi:

- apps/api/tsconfig.json
- packages/db/tsconfig.json
- packages/domain/tsconfig.json
- packages/shared/tsconfig.json
- tsconfig.tests.json

Jeśli część istnieje, popraw je.

2. Dodaj scripts typecheck w package.json każdego workspace, np.:

packages/domain:
"typecheck": "tsc -p tsconfig.json --noEmit"

packages/db:
"typecheck": "tsc -p tsconfig.json --noEmit"

apps/api:
"typecheck": "tsc -p tsconfig.json --noEmit"

packages/shared:
"typecheck": "tsc -p tsconfig.json --noEmit"

3. Root `typecheck` ma odpalać realny TypeScript check, np.:

"pnpm --filter @poza-nuta/domain typecheck && pnpm --filter @poza-nuta/db typecheck && pnpm --filter @poza-nuta/api typecheck && pnpm --filter @poza-nuta/public-web typecheck && tsc -p tsconfig.tests.json --noEmit"

Custom `scripts/typecheck.mjs` może zostać jako dodatkowy architecture/custom check, ale nie może być jedynym checkiem dla API/packages/tests.

Jeśli zostaje, zmień jego nazwę na coś jaśniejszego, np. `check:architecture`.

4. Napraw błędy TS:

A) permissions `.includes()`

Problem:
literal tuple arrays zawężają argument `.includes()` do zbyt wąskiego typu albo `never`.

Napraw przez jawne typowanie mapowań jako:

Record<Role, readonly Permission[]>

i w funkcjach has* przypisz tablicę do zmiennej o szerokim typie:

const permissions: readonly PlatformPermission[] = platformRolePermissions[role]

Analogicznie dla organization, venue access i event staff.

Usuń zbędne rzutowanie `permission as EventPermission`, jeśli da się bez niego.

B) server.address().port

Napraw narrowowanie:

const address = server.address()
if (!address || typeof address === "string") throw ...
const port = address.port

C) EventSummary Date typing

Service/fake test implementation nie może zwracać string | Date | null, jeśli EventSummary oczekuje Date | null.

Dodaj helper:

toDateOrNull(value: string | Date | null | undefined): Date | null

i normalizuj startsAt/endsAt.

Nie rozwadniaj EventSummary do string | Date | null.

D) inject.Response.headers typing

Nie zakładaj, że headers to tylko string | string[] | undefined.
Node OutgoingHttpHeaders może mieć number.

Zmień helper/test type na:

Record<string, string | number | string[] | undefined>

albo użyj OutgoingHttpHeaders.

5. Po tej części edytor nie powinien pokazywać tych błędów, a `pnpm typecheck` powinien je łapać, gdy wrócą.

CZĘŚĆ B — Root package scripts cleanup

Docelowa architektura to:

- apps/public-web jako główny public frontend,
- apps/api Fastify jako główne API,
- apps/web Vite jako legacy reference, jeśli jeszcze zostaje.

Zmień root scripts:

1. `dev` powinien uruchamiać target architecture:

pnpm dev:api + pnpm dev:public

2. Legacy skrypty nazwij jawnie:

dev:web:legacy
build:web:legacy
dev:api:legacy

3. Jeżeli zostawiasz `build:web`, niech nie oznacza legacy. Preferowane:
- usuń `build:web`,
- albo zmień na alias do `build:public`,
- a stary Vite build nazwij `build:web:legacy`.

4. Dodaj ogólny build:

"build": "pnpm build:public"

Jeśli API ma build script, dodaj też build:api. Jeśli nie ma jeszcze API build, nie wymyślaj za dużo — opisz odroczenie.

5. `test` może zostać na Node test runner.

Nie dodawaj Vitest.

Ale przygotuj pattern na przyszłość:

"test": "node --experimental-strip-types --test \"tests/*.test.ts\" \"apps/**/*.test.ts\" \"packages/**/*.test.ts\""

CZĘŚĆ C — Legacy retirement decision

Nie musisz w tym kroku usuwać całego apps/web, jeśli testy nadal go potrzebują.

Ale wykonaj minimum:

1. Oznacz legacy jasno:
- rename scripts na legacy,
- README: apps/web i apps/api/src/server.ts są legacy reference,
- główny dev/build nie używa legacy.

2. Jeśli można bezpiecznie usunąć apps/web i jego testy po przeniesieniu coverage do public-web tests, zrób to.
Jeśli nie, zostaw i opisz dokładnie, co blokuje usunięcie.

3. data/events:
Jeśli legacy JSON queue tests nadal tego potrzebują, przenieś fixtures do tests/fixtures albo zostaw jako legacy fixture.
Nie może być traktowane jako runtime storage target architecture.

4. dist:
Jeśli dist jest śledzony przez git, usuń z repo.
Jeśli nie jest śledzony, upewnij się, że jest ignorowany.

CZĘŚĆ D — Dokumenty

Zaktualizuj:

/docs/POZA_NUTA_CODEX_BRIEF.md
/docs/POZA_NUTA_IMPLEMENTATION_CHECKLIST.md
/docs/POZA_NUTA_LINE_BY_LINE_AUDIT.md

Dodaj sekcję:

"Typecheck integrity cleanup"

Oznacz:
- root typecheck obejmuje API/packages/tests,
- legacy scripts są jawnie nazwane,
- domyślne dev/build używają target architecture.

CZĘŚĆ E — Walidacja

Uruchom:

pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm build:public
pnpm smoke:api
pnpm check:clean-package
pnpm pack:source

Jeśli legacy build zostaje:

pnpm build:web:legacy

Jeśli smoke failuje przez zajęty port, uruchom na innym porcie:

API_PORT=54329 pnpm smoke:api

OCZEKIWANY RAPORT

Na końcu podaj:

1. Utworzone pliki.
2. Zmodyfikowane pliki.
3. Jak zmienił się typecheck.
4. Jakie błędy TS naprawiono.
5. Czy użyto `any`.
6. Jak zmieniły się root scripts.
7. Co zostało legacy i dlaczego.
8. Czy apps/web usunięto, czy zostawiono.
9. Czy dist/data zostały usunięte/przeniesione/zostawione.
10. Wyniki komend.
11. Co zostało odroczone.

Nie twierdź, że cleanup jest skończony, jeśli:
- `pnpm typecheck` nadal nie obejmuje tests,
- edytor nadal pokazuje wskazane błędy,
- domyślne `dev` nadal odpala legacy Vite app,
- build scripts nadal mylą target architecture z legacy.
```

---

## 10. Po tym tasku

Dopiero po tym:

```txt
1. db:seed:demo dla QA
2. H6 queue concurrency hardening
3. dashboard-web MVP
```

Jeśli typecheck kłamie, dalszy development to ślepe dokładanie kodu.
