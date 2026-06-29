# Beta Session / Invite QA Evidence - 2026-06-28

Ten raport dotyczy brancha `beta-session-invite-qa-evidence` i release candidate
`4a6742cf640a1a934f77a4a43dc64da42b060ad2`.

Nie zawiera sekretow, tokenow, cookies ani prywatnych URL-i. Status `PASS` oznacza, ze wskazany dowod zostal
faktycznie wykonany. `BLOCKED` albo `NOT RUN` nie sa zaliczane jako PASS.

## 1. Srodowisko i wykonane polecenia

| Evidence | Status | Wynik / referencja |
|---|---|---|
| Zaleznosci z lockfile | PASS | `corepack pnpm install --frozen-lockfile`, pnpm 10.17.1 |
| Typecheck | PASS | `corepack pnpm typecheck` |
| Lint | PASS | `corepack pnpm lint`: 194 files checked |
| Automatyczne testy kontraktowe | PASS | `corepack pnpm test`: 479 passed, 0 failed, 0 skipped |
| Build | PASS | `corepack pnpm build`: public-web i dashboard-web |
| Whitespace check | PASS | `git diff --check` |
| Lokalny Postgres/manual full-stack | BLOCKED | Docker Desktop daemon nie byl uruchomiony; nie wykonano migracji ani seedu |
| In-app Browser smoke | BLOCKED | Public-web i kontrolowany API fixture wystartowaly, ale karta Browsera nie mogla zostac przypieta do sesji automatyzacji |
| Staging QA | NOT RUN | Brak staging URL-i, danych QA, operator credentials i urzadzen w tym wykonaniu |

Kontrolowany API fixture byl uzyty tylko do proby browser smoke i zostal zatrzymany. Nie jest dowodem backendu,
Postgresa, Redis, OAuth ani staging proxy. Te warstwy sa oznaczone oddzielnie.

## 2. Macierz scenariuszy

| Scenariusz | Automated | Manual/staging | Evidence | Wynik |
|---|---|---|---|---|
| Open event | PASS | BLOCKED | Landing/session routing, event-first submit, myRequests, operator mutations i SSE sa pokryte testami | BLOCKED |
| Invite-required bez access | PASS | BLOCKED | Detail pozostaje widoczny, session renderuje gate bez `JoinForm`, backend odrzuca submit | BLOCKED |
| Invite-required po QR/invite | PASS | BLOCKED | Claim ustawia participant cookie/access, redirectuje do session i pozwala submitowac | BLOCKED |
| Closed submissions | PASS | BLOCKED | Session nie renderuje `JoinForm`, backend blokuje submit, queue read ma osobna policy | BLOCKED |
| Invite rotate | PASS | BLOCKED | Stary kod jest niewazny, nowy dziala, istniejacy participant access pozostaje | BLOCKED |
| Invite revoke | PASS | BLOCKED | Nowy claim jest blokowany, revoke jest idempotentny, istniejacy access pozostaje | BLOCKED |
| Public queue route | PASS | BLOCKED | Standalone `/event/:eventPublicId/queue` jest controlled 404; kolejka jest w session | BLOCKED |
| SSE reconnect | PASS | BLOCKED | Jeden EventSource, open/connected/domain refresh, reconnect do Live, cleanup, heartbeat i brak pollingu | BLOCKED |
| Mobile QR smoke | PASS | BLOCKED | Kontrakty QR URL/claim/redirect sa pokryte; realna przegladarka mobilna i cookie nie byly sprawdzone | BLOCKED |

Scenariusze maja wynik `BLOCKED`, poniewaz beta evidence wymaga rowniez wykonania manualnego na stagingu albo
production-like srodowisku. Automatyczne PASS nie zostalo rozszerzone na niewykonane urzadzenia i infrastrukture.

## 3. Automatyczne evidence

Pelny test suite potwierdzil miedzy innymi:

- event-first landing, session, submit, queue i myRequests kontrakty;
- brak formularza dla invite-required bez access i dla closed submissions;
- backendowe odrzucenie submitu bez access albo przy zamknietych zgloszeniach;
- invite claim, participant cookie/hash, idempotentny access i redirect do participant session;
- rotate/revoke bez cofania juz nadanego `participant_event_access`;
- controlled 404 dla standalone queue route;
- operator approve/start/done/reject/skip/move oraz gestosc kolejki;
- SSE heartbeat, cleanup, event emission po submit/status/reorder i sanitized public payload;
- powrot do Live po reconnect, pojedynczy EventSource i brak interval pollingu.

To evidence pochodzi z testow w `tests/public-web.test.ts`, `tests/postgres-queue.test.ts`,
`tests/dashboard-web.test.ts` i `tests/sse.test.ts`.

## 4. Wymagane manualne evidence przed beta GO

| Priorytet | Brakujacy dowod | Oczekiwane wykonanie | Proponowany owner | Status |
|---|---|---|---|---|
| P0 | Open event end-to-end | Telefon wysyla request; operator widzi pending i wykonuje approve/start/done bez F5 | QA + operator | NOT RUN |
| P0 | Invite-required end-to-end | Gate bez access, QR claim, redirect, submit i myRequests na tej samej przegladarce | QA | NOT RUN |
| P0 | Closed submissions | Landing/session i bezposredni API submit potwierdzone na stagingu | QA | NOT RUN |
| P0 | SSE multi-view | Telefon A, telefon B i dashboard aktualizuja sie bez refresh; reconnect wraca do Live | QA + engineering | NOT RUN |
| P0 | Mobile participant cookie | Fizyczne mobile albo real device browser zachowuje access po QR claim | QA | NOT RUN |
| P1 | Rotate/revoke operator flow | Dashboard QR panel, stary/nowy kod oraz istniejacy participant access | QA + operator | NOT RUN |
| P1 | Proxy/Redis transport | Brak buforowania heartbeat; cross-instance fanout przy wielu instancjach | Engineering | NOT RUN |
| P1 | OAuth/operator permissions | Realny event operator moze dzialac; obcy user dostaje kontrolowany brak dostepu | QA + engineering | NOT RUN |

## 5. Blockery i follow-up branche

Nie znaleziono nowego udowodnionego buga runtime. Znaleziono braki evidence:

- `qa/staging-session-invite-e2e`: wykonac scenariusze open, invite-required, closed i operator lifecycle na stagingu;
- `qa/mobile-qr-cookie-smoke`: wykonac QR claim, submit i myRequests na fizycznym urzadzeniu;
- `qa/staging-sse-reconnect`: potwierdzic reconnect, jeden EventSource, heartbeat/proxy i Redis fanout.

Nazwy powyzej sa propozycjami osobnych branchy, nie utworzonymi branchami ani ukrytymi TODO w runtime.

## 6. Decyzja

**BLOCKED**

Kod ma szerokie automatyczne pokrycie, ale wymagane manualne beta evidence dla operatora, mobile, OAuth,
staging proxy i Redis nie zostalo wykonane. Ten raport nie rekomenduje beta GO, dopoki wszystkie P0 z sekcji 4
nie beda mialy realnych referencji, daty, wykonawcy i wyniku PASS.
