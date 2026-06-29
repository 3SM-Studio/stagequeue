# Beta Staging Smoke Runbook

Ten runbook prowadzi realny manualny smoke aktualnego public session i invite flow. Nie jest evidence sam w
sobie: wynik trzeba zapisac w kopii
`13-qa-evidence-release-signoff-template.md` albo w osobnym, datowanym raporcie.

Beta sign-off pozostaje `BLOCKED`, dopoki wymagane scenariusze P0 nie maja realnego wyniku `PASS`.

## 1. Prerequisites

Przed rozpoczeciem zapisz bez sekretow:

- branch i pelny commit SHA release candidate;
- publiczne `PUBLIC_WEB_URL`, `DASHBOARD_WEB_URL` i `API_URL`;
- date, strefe czasowa, testera i approvera;
- operator account z uprawnieniami do testowego eventu albo zatwierdzony sposob uzyskania dostepu;
- aktywny open event z public join i public queue;
- aktywny `invite_required` event z aktywnym invite;
- closed event albo zgode na zamkniecie i odtworzenie testowego eventu;
- osobne konteksty przegladarki dla participant i operatora;
- mobile device albo drugi czysty browser profile;
- dostep do logow staging i konfiguracji liczby instancji API;
- Redis-backed staging, jesli ma byc potwierdzony cross-instance fanout.

Nigdy nie zapisuj w evidence:

- sekretow env, tokenow OAuth ani naglowka `Authorization`;
- cookies, participant tokenu ani jego hasha;
- `DATABASE_URL` ani `REDIS_URL`;
- pelnego invite code albo pelnego invite URL;
- danych osobowych uczestnikow innych niz kontrolowane dane QA.

Invite zapisuj w postaci maskowanej, na przyklad `/invite/abcd...wxyz`.

## 2. Local Environment Preflight

Ten preflight nie zastepuje staging QA. Pozwala potwierdzic, czy lokalny full-stack smoke jest w ogole mozliwy.

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
docker info
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $_.LocalPort -in 5432, 4321, 3000, 3001 } |
  Select-Object LocalAddress, LocalPort, OwningProcess
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

Jesli `docker info` nie laczy sie z daemonem:

1. Zapisz local full-stack jako `BLOCKED`.
2. Zapisz dokladny, niesekretny powod.
3. Nie oznaczaj migracji, seedu ani local smoke jako `PASS`.
4. Nie naprawiaj Docker Desktop w branchu dokumentacyjnym.

Tylko gdy Docker dziala, uzyj istniejacych komend repo:

```powershell
docker compose up -d
corepack pnpm db:migrate
corepack pnpm db:seed:catalog
corepack pnpm db:seed:demo
corepack pnpm dev
```

Po QA zatrzymaj procesy uruchomione przez testera. Nie czysc szeroko wspoldzielonej bazy i nie wykonuj
destrukcyjnego `TRUNCATE`.

## 3. Staging Preflight

Wykonaj przed scenariuszami domenowymi:

- [ ] API healthcheck odpowiada poprawnie i nie ujawnia konfiguracji.
- [ ] Public web otwiera sie po HTTPS.
- [ ] Dashboard web otwiera sie po HTTPS.
- [ ] Public web, dashboard i API wskazuja ten sam release candidate/environment.
- [ ] CORS pozwala tylko oczekiwanym originom i requesty z credentials dzialaja.
- [ ] Secure cookie jest ustawiane i wraca do API zgodnie z domena staging.
- [ ] Dashboard OAuth/login dziala dla operatora.
- [ ] Operator ma dostep do testowego eventu; obcy account nie ma dostepu.
- [ ] `/event/:eventPublicId` otwiera landing.
- [ ] `/event/:eventPublicId/session` otwiera participant app.
- [ ] `/event/:eventPublicId/queue` zwraca controlled 404.
- [ ] Logi nie ujawniaja invite code, cookies, tokenow ani connection strings.

Jesli brakuje konta, danych albo dostepu do staging, uzyj odpowiednio `NEEDS OPERATOR ACCOUNT`,
`NEEDS STAGING` albo `BLOCKED`. Nie kontynuuj scenariusza przez obchodzenie auth.

## 4. Open Event

1. W participant context otworz `/event/:eventPublicId`.
2. Potwierdz nazwe eventu, lokal, status i brak formularza na landingu.
3. Kliknij CTA i potwierdz `/event/:eventPublicId/session`.
4. Potwierdz `Live`, widoczna kolejke i `JoinForm`.
5. Wyslij unikalna piosenke QA.
6. Potwierdz pending w `myRequests`.
7. W operator context potwierdz pending bez F5.
8. Wykonaj approve, start i done.
9. Po kazdej operacji potwierdz aktualizacje participant session bez manual refresh.

Evidence:

- timestamp i publiczny URL bez query/tokenow;
- participant browser/device i operator browser;
- wynik `PASS`, `FAIL` albo `BLOCKED`;
- opcjonalny screenshot bez cookies, invite code i danych prywatnych;
- obserwowany stan badge SSE;
- wynik approve/start/done i ewentualny request ID z bezpiecznych logow.

## 5. Invite-required Without Access

1. Uzyj czystego participant profile bez cookie z poprzednich testow.
2. Otworz landing i potwierdz, ze event pozostaje widoczny.
3. Otworz `/event/:eventPublicId/session`.
4. Potwierdz gate QR/invite oraz brak `JoinForm` i pol piosenki.
5. Jesli polityka staging pozwala, wyslij bezposredni POST bez cookie/access do event-first submit endpointu,
   uzywajac unikalnych danych QA.
6. Potwierdz kontrolowane odrzucenie backendowe. Nie zapisuj response headers zawierajacych cookies.
7. Jesli request niespodziewanie utworzy pending, oznacz `FAIL` i usun dane tylko przez istniejacy operator flow.

## 6. Invite Claim via QR

1. W dashboardzie odczytaj aktywny invite URL testowego eventu.
2. Nie kopiuj pelnego URL do evidence; zapisz tylko forme maskowana.
3. Otworz QR/link na mobile albo w czystym browser profile.
4. Potwierdz redirect do `/event/:eventPublicId/session`, bez invite code w docelowym URL-u.
5. Potwierdz, ze session pokazuje `JoinForm`.
6. Wyslij piosenke i potwierdz `myRequests`.
7. Odswiez session i potwierdz, ze participant access nadal dziala przez cookie/access policy.

DevTools moze potwierdzic istnienie cookie, ale evidence zapisuje tylko `cookie present: yes/no`, bez nazwy
wartosci, pelnego naglowka ani tokenu.

## 7. Closed Submissions

1. Uzyj przeznaczonego do QA eventu i zapisz jego stan poczatkowy.
2. Zamknij event przez istniejaca akcje operatora.
3. Potwierdz closed state na landingu.
4. Potwierdz brak submit form w participant session.
5. Potwierdz kontrolowane odrzucenie bezposredniego submitu backendowego.
6. Potwierdz widocznosc albo ukrycie kolejki zgodnie z aktualnym `publicQueueEnabled` i public queue policy.
7. Nie przywracaj niedozwolonej transition. Odtworz dane osobnym testowym eventem, jesli jest to potrzebne.

## 8. Rotate Invite

1. Participant A claimuje aktywny invite i potwierdza access.
2. Operator wybiera `Wygeneruj nowy kod`.
3. Czysty participant B probuje starego, maskowanego linku i dostaje kontrolowany invalid invite state.
4. Participant B otwiera nowy invite i uzyskuje access.
5. Participant A odswieza session i nadal ma access.
6. Evidence zawiera dwa rozne maskowane identyfikatory, nigdy pelne kody.

## 9. Revoke Invite

1. Participant A claimuje aktywny invite i potwierdza access.
2. Operator wybiera `Uniewaznij kod`.
3. Czysty participant B probuje revoked invite i nie uzyskuje accessu.
4. Participant A odswieza session i nadal ma access.
5. Potwierdz w notatce, ze revoke blokuje przyszle claimy, nie cofa `participant_event_access`.
6. Nie traktuj revoke jako resetu cooldownu, limitu requestow ani narzedzia antyspamowego.

## 10. SSE Reconnect

1. Otworz participant session i potwierdz badge `Live`.
2. W operator queue wykonaj approve/start/done albo move.
3. Potwierdz aktualizacje participant session bez manual refresh.
4. W DevTools sprawdz jeden event-scoped `EventSource`.
5. Jesli staging i narzedzia na to pozwalaja, chwilowo rozlacz participant network.
6. Potwierdz stan laczenia/reconnect bez crasha UI.
7. Przywroc network i potwierdz powrot badge do `Live` oraz aktualny snapshot.
8. Potwierdz brak drugiego EventSource, `setInterval`, `refetchInterval` i cyklicznych fetchy.
9. Potwierdz heartbeat `: ping` bez zapisywania prywatnych naglowkow.

Jesli kontrolowane rozlaczenie nie jest dozwolone, oznacz ten krok `BLOCKED`, a nie `PASS`.

## 11. Redis Fanout / Multi-instance

Wykonuj tylko wtedy, gdy staging faktycznie ma co najmniej dwie instancje API i mozna potwierdzic routing
requestow bez ujawniania infrastrukturalnych sekretow.

1. Potwierdz z engineering ownerem, ze operator mutation i participant SSE trafily do roznych instancji.
2. Wykonaj operator mutation.
3. Potwierdz event i snapshot refresh w participant session.
4. Sprawdz publiczne SSE `data`: tylko `type` i `at`.
5. Potwierdz brak internal event, venue, request i organization IDs.
6. Zapisz referencje do bezpiecznych logow/request IDs, bez `REDIS_URL` i payloadow domenowych.

Single-instance staging nie potwierdza Redis fanout. Uzyj wtedy `NEEDS STAGING` albo `BLOCKED`.

## 12. Failure Classification

| Status | Znaczenie |
|---|---|
| `PASS` | Scenariusz wykonano w wymaganym srodowisku, wynik zgadza sie z oczekiwaniem i istnieje evidence. |
| `FAIL` | Scenariusz wykonano, a zachowanie produktu jest niepoprawne albo niebezpieczne. |
| `BLOCKED` | Proba byla mozliwa do rozpoczecia, ale konkretna zaleznosc lub awaria uniemozliwila wynik. |
| `NOT RUN` | Scenariusza nie rozpoczeto. Nie jest to PASS. |
| `NEEDS STAGING` | Lokalny lub single-instance test nie moze udowodnic wymaganego zachowania staging. |
| `NEEDS MOBILE` | Brakuje realnego mobile/device browser evidence. |
| `NEEDS OPERATOR ACCOUNT` | Brakuje autoryzowanego konta operatora; nie wolno obchodzic auth. |

`NEEDS_*` jest precyzyjnym powodem `BLOCKED`/`NOT RUN`, nie substytutem wyniku release.

## 13. Evidence Table

Skopiuj po jednym wierszu dla kazdej proby:

| Scenario | Environment | Commit SHA | Actor/browser | Result | Evidence link/path | Notes | Follow-up issue/branch |
|---|---|---|---|---|---|---|---|
| Open event | staging |  | participant + operator | NOT RUN |  |  |  |
| Invite-required without access | staging |  | clean participant | NOT RUN |  |  |  |
| Invite claim via QR | staging |  | mobile/clean participant | NOT RUN |  |  |  |
| Closed submissions | staging |  | participant + operator | NOT RUN |  |  |  |
| Rotate invite | staging |  | participant A/B + operator | NOT RUN |  |  |  |
| Revoke invite | staging |  | participant A/B + operator | NOT RUN |  |  |  |
| SSE reconnect | staging |  | participant + operator | NOT RUN |  |  |  |
| Redis fanout | multi-instance staging |  | participant + operator | NOT RUN |  |  |  |

Evidence link moze wskazywac kontrolowany screenshot, CI run, request ID albo bezpieczny fragment logu. Nie
umieszczaj evidence w publicznym miejscu, jesli zawiera dane dostepowe lub dane uczestnikow.

## 14. Follow-up Branch Naming

Nie naprawiaj znalezionego problemu w branchu evidence/runbook. Zapisz ownera i osobny branch:

- runtime bug: `fix/<scope>-<short-description>`;
- brakujaca dokumentacja: `docs/<scope>-<short-description>`;
- brak regresyjnego pokrycia: `test/<scope>-<short-description>`;
- infrastruktura lub narzedzia QA: `chore/<scope>-<short-description>`.

Przyklady:

- `fix/public-session-invite-cookie`;
- `fix/sse-reconnect-live-state`;
- `test/invite-rotate-existing-access`;
- `chore/staging-multi-instance-smoke`.

Kazdy `FAIL` musi miec severity, ownera, workaround albo jawny brak workaroundu oraz decyzje, czy blokuje beta.

## 15. Exit Criteria

Run jest gotowy do sign-off review, gdy:

- kazdy scenariusz P0 ma realny `PASS`; dowolny P0 `FAIL`, `BLOCKED` albo `NOT RUN` oznacza beta `NO-GO`;
- mobile QR/cookie ma realne device evidence;
- operator multi-view i SSE reconnect maja evidence bez F5/pollingu;
- staging auth, CORS, HTTPS i controlled 404 sa potwierdzone;
- multi-instance Redis fanout ma `PASS` albo release owner potwierdzil, ze staging jest single-instance i ryzyko
  zostalo jawnie przeniesione;
- wszystkie `FAIL`/`BLOCKED` maja follow-up ownera;
- finalna decyzja jest wpisana jako `GO`, `CONDITIONAL GO` albo `NO-GO` zgodnie z beta release runbookiem.

Samo wypelnienie tabeli nie zmienia beta sign-off na GO.
