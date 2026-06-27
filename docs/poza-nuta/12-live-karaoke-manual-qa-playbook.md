# Poza Nuta - Live Karaoke Manual QA Playbook

Ten playbook jest instrukcja recznego QA przed releasem albo demo live karaoke flow. Nie zastepuje testow automatycznych ani checklisty deploymentu. Ma pomoc czlowiekowi przejsc pelny scenariusz: uczestnik wysyla piosenke, operator prowadzi kolejke, publiczne widoki aktualizuja sie bez ujawniania danych prywatnych.

## 1. Pre-flight

- [ ] GitHub Actions jest zielony, w tym required check `Repository CI / Quality gates`.
- [ ] Lokalnie albo w CI przeszly co najmniej: `pnpm check:clean-package`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- [ ] `git status` jest czysty albo wszystkie lokalne zmiany sa swiadomie opisane w notatce QA.
- [ ] Env/config jest gotowy: API, public-web i dashboard-web wskazuja te same srodowisko.
- [ ] Sekrety nie sa wpisane w repo ani w logach.
- [ ] Baza jest zmigrowana.
- [ ] Dane testowe sa gotowe: lokal, organizacja i event do testu.
- [ ] Przygotowane sa dwie oddzielne sesje przegladarki:
  - uczestnik: public-web, bez sesji dashboard;
  - operator: dashboard-web, zalogowany.
- [ ] Opcjonalnie przygotuj trzeci widok incognito albo mobile dla public queue.

Lokalny setup demo:

```bash
docker compose up -d
pnpm db:migrate
pnpm db:seed:catalog
pnpm db:seed:demo
pnpm dev
```

Lokalne URL-e:

```txt
Public discovery:  http://localhost:3000/
Participant event: http://localhost:3000/event/<eventPublicId>
Legacy venue read: http://localhost:3000/demo-klub
Dashboard events:  http://localhost:3001/dashboard/events
```

Jesli potrzebujesz identyfikatorow eventu demo:

```sql
select id, public_id, slug, status from events where slug = 'demo-karaoke';
```

Legacy URL-e `/demo-klub/join`, `/demo-klub/queue` oraz `/:venueSlug/events/:eventSlug*` maja zwracac 404.
Canonical read-only public queue jest dostepna pod `/event/:eventPublicId/queue`.

## 2. Accounts and Sessions

- [ ] Operator jest zalogowany do dashboardu przez Google OAuth / Better Auth.
- [ ] `GET /me` dla operatora zwraca `authenticated=true`.
- [ ] Operator ma dostep do dashboardu przez role/staff assignment albo platform owner support access.
- [ ] Sesja uczestnika nie ma dashboard auth. Uzyj osobnej przegladarki, incognito albo profilu.
- [ ] Cookies sa wlaczone w obu sesjach.
- [ ] Participant cookie `pn_participant` moze byc zapisane przez public submit.
- [ ] Cross-origin credentials dzialaja: dashboard/public web wysylaja requesty do API z cookies.
- [ ] Nie mieszaj sesji operatora i uczestnika w tej samej zakladce, jesli testujesz prywatnosc.

## 3. Event Setup

- [ ] Lokal jest publicznie widoczny: `status=active`, `verificationStatus=verified`.
- [ ] Organizacja lokalu jest aktywna.
- [ ] Event testowy istnieje i nalezy do lokalu.
- [ ] Dla happy path event ma `status=active`.
- [ ] `publicJoinEnabled=true` dla testu submitu.
- [ ] `publicQueueEnabled=true` dla testu public queue.
- [ ] Sprawdz warianty statusu:
  - `scheduled` albo `draft`: public submit nie powinien dzialac;
  - `active`: public submit dziala;
  - `paused`: public submit zablokowany, public queue widoczna;
  - `closed`: submit zablokowany; public queue snapshot moze pozostac widoczny zgodnie z polityka API;
  - `archived` i `cancelled`: public queue/event nie powinny byc widoczne.

## 4. Participant Join Flow

1. Otworz `http://localhost:3000/event/<eventPublicId>`.
2. Sprawdz, ze strona pokazuje wlasciwy event oraz lokal bez ujawniania internal event UUID.
3. Sprawdz, ze formularz jest widoczny tylko dla aktywnego eventu z wlaczonym public join i dozwolonym access policy.
4. Wyslij pusty formularz i potwierdz czytelne bledy walidacji.
5. Wyslij poprawny request:
   - singer name;
   - song title;
   - song artist;
   - opcjonalna notatka, jesli UI ja pokazuje.
6. Po submit oczekuj komunikatu:

```txt
Poczekaj na zatwierdzenie prowadzacego.
```

7. Potwierdz, ze request trafia do backendu jako `pending`.
8. Sprawdz cooldown: szybki kolejny submit powinien dac czytelny komunikat limitu.
9. Sprawdz limit aktywnych requestow uczestnika: `pending`, `approved` i `now` licza sie do limitu; `done`, `rejected`, `skipped` nie powinny.
10. Sprawdz `my-requests` tracking:
     - po approve komunikat zmienia sie na zatwierdzony;
     - po start komunikat zmienia sie na "teraz twoja kolej";
     - po reject/skip/done komunikat pokazuje koncowy status.
11. Dla `joinAccessMode=invite_required` sprawdz, ze bez claim formularz jest zablokowany.
12. Otworz `/invite/<inviteCode>`, potwierdz redirect do `/event/<eventPublicId>` i ponow submit.
13. Potwierdz, ze `publicJoinEnabled=false` blokuje submit takze po claim.

## 5. Operator Queue Flow

1. Otworz `http://localhost:3001/dashboard/events`.
2. Kliknij `Otworz kolejke` przy aktywnym evencie.
3. Jesli uzywasz fallbacku QA/dev, wejdz na `http://localhost:3001/dashboard/events/<eventId>/queue`.
4. Sprawdz sekcje:
   - `Now`;
   - `Pending`;
   - approved queue;
   - historia: done/rejected/skipped.
5. Wyslij request z public join i potwierdz, ze pending pojawia sie w dashboard queue bez F5, w oczekiwanym czasie safe refreshu.
6. Kliknij `Approve`.
7. Sprawdz, ze request przechodzi do approved queue i dostaje pozycje.
8. Kliknij `Reject` na osobnym pending requestcie i potwierdz status rejected.
9. Zatwierdz kilka requestow i wykonaj `Move`.
10. Potwierdz, ze approved positions sa geste: `1, 2, 3, ...`, bez dziur i duplikatow.
11. Kliknij `Start` na approved request.
12. Potwierdz, ze istnieje maksymalnie jeden request w statusie `now`.
13. Kliknij `Done` dla aktualnego requestu.
14. Kliknij `Skip` dla approved albo now requestu i potwierdz poprawne przeliczenie pozycji.
15. Przy kazdej mutacji sprawdz, ze przyciski nie zostaja disabled bez konca.

## 6. Live Update and SSE Checks

- [ ] Uczestnik wysyla request w public join.
- [ ] Operator widzi pending bez manualnego reloadu, przez bezpieczny refresh/SSE fallback.
- [ ] Operator approve/start/done aktualizuje public queue i status uczestnika.
- [ ] Public queue reaguje na `queue.updated` albo safe refresh.
- [ ] Public join reaguje na zmiany statusu eventu: pause/resume/close.
- [ ] SSE disconnect jest non-fatal: UI nie crashuje i nadal da sie uzyc manual refreshu.
- [ ] Po nawigacji tam i z powrotem nie powstaja duplikaty subskrypcji.
- [ ] Lifecycle actions maja priorytet nad realtime. `Pause`, `Resume`, `Close` nie moga wisiec przez stream connection starvation.

Praktyczna kontrola w devtools:

- w Network nie powinno byc wielu rownoleglych streamow dla tego samego venue/event;
- POST/PATCH akcji operatora nie powinien wisiec na `Provisional headers`;
- po bledzie sieci przyciski operatora powinny sie odblokowac.

### C20f staging evidence

- [ ] Operator otwiera `/dashboard/events/<eventId>/queue`.
- [ ] Telefon A skanuje `/invite/<inviteCode>`, wraca na `/event/<eventPublicId>` i wysyla piosenke.
- [ ] Pending request pojawia sie w operator queue bez recznego odswiezenia.
- [ ] Telefon B ma otwarte `/event/<eventPublicId>/queue`.
- [ ] Operator wykonuje approve, start, done i move/reorder.
- [ ] Telefon B widzi zatwierdzenie, kolejnosc i zmiany `now` bez recznego odswiezenia.
- [ ] Po rozlaczeniu i przywroceniu sieci telefonu B EventSource laczy sie ponownie i refetchuje snapshot.
- [ ] DevTools pokazuje jedna EventSource per page.
- [ ] Publiczne domain-update SSE `data` zawiera tylko `type` i `at`, bez internal event/venue/request/organization IDs.
- [ ] Heartbeat `: ping` utrzymuje polaczenie przez timeout proxy.
- [ ] Staging proxy Railway/Render nie buforuje SSE.
- [ ] Przy wiecej niz jednej instancji API event przechodzi miedzy instancjami przez Redis Pub/Sub.
- [ ] Zapisano date, release SHA, przegladarki/urzadzenia, wykonawce QA i wynik kazdego punktu; brak evidence oznacza `NOT RUN`.

## 7. Public Queue Visibility

- [ ] Otworz `/event/<eventPublicId>/queue` z linku `Kolejka wydarzenia` na canonical event page.
- [ ] Link `Wroc do wydarzenia` prowadzi do `/event/<eventPublicId>`.
- [ ] Pending requests nie sa widoczne publicznie.
- [ ] Public queue pokazuje aktualny `now` oraz approved queue zgodnie z polityka produktu.
- [ ] Prywatne notatki operatora nigdy nie sa widoczne publicznie.
- [ ] `publicQueueEnabled=false` pokazuje kontrolowany stan `Kolejka tego wydarzenia nie jest publiczna.`.
- [ ] `scheduled` pokazuje kontrolowany stan `Kolejka bedzie dostepna po rozpoczeciu wydarzenia.`.
- [ ] `paused` event: queue jest widoczna, ale join/submissions sa zamkniete.
- [ ] `closed` event: submit jest zamkniety; snapshot kolejki jest traktowany zgodnie z aktualna polityka public API.
- [ ] `invite_required` bez participant access nadal pozwala czytac publiczna kolejke, ale nie submitowac.
- [ ] `publicJoinEnabled=false` nie blokuje odczytu publicznej kolejki.
- [ ] `archived` i `cancelled` nie sa widoczne przez public queue.
- [ ] Event albo venue ukryte administracyjnie nie ujawniaja prywatnego stanu publicznemu uzytkownikowi.

## 8. Lifecycle Checks

Przejdz lifecycle z dashboard queue:

- [ ] `scheduled` albo `draft` nie przyjmuje public submitu.
- [ ] `Start` przenosi event do `active`, jesli transition jest dozwolony.
- [ ] `active` przyjmuje public submit przy `publicJoinEnabled=true`.
- [ ] `Pause` blokuje public submit bez F5 na public join.
- [ ] `paused` zachowuje public queue visibility przy `publicQueueEnabled=true`.
- [ ] `Resume` przywraca public submit, jesli `publicJoinEnabled=true`.
- [ ] `Close` zatrzymuje submit i ustawia zamkniety stan eventu.
- [ ] `Archive` po zamknieciu/anulowaniu ukrywa event z public live flow.
- [ ] `Cancel` blokuje public flow.
- [ ] Niedozwolona transition daje czytelny blad 409, bez surowego stack trace.

## 9. Permissions and Security Checks

- [ ] Niezalogowany dashboard user nie moze otworzyc operator queue.
- [ ] User bez uprawnien do eventu dostaje kontrolowany 403.
- [ ] Event staff z rola operatora kolejki moze obslugiwac swoj event.
- [ ] Obcy tenant/user nie moze obslugiwac cudzego eventu.
- [ ] Platform owner support access dziala tylko przez jawna sciezke support override.
- [ ] Platform owner support operation zapisuje audit log.
- [ ] Public endpointy nie wymagaja konta uczestnika i nie ujawniaja sesji dashboard.
- [ ] `pn_participant` nie jest zwracane w response body ani zapisywane plaintext w DB.
- [ ] Public `my-requests` zwraca tylko requesty aktualnego participant token hash.

Jesli DB inspection jest dostepny, sprawdz audit:

```sql
select actor_user_id, target_event_id, operation, permission, access_type, outcome, created_at
from platform_support_audit_events
order by created_at desc
limit 20;
```

## 10. Failure Checks

- [ ] Zatrzymaj API i sprawdz, ze public-web pokazuje czytelny blad zamiast stack trace.
- [ ] Zatrzymaj API i sprawdz, ze dashboard pokazuje API unavailable / blad odswiezenia.
- [ ] SSE disconnect jest non-fatal.
- [ ] Manual refresh na dashboard events i operator queue dziala po powrocie API.
- [ ] Rate limit public submit daje czytelny stan, bez wycieku tokenow.
- [ ] Timeout mutacji operatora odblokowuje przyciski i pokazuje czytelny blad.
- [ ] API error envelope nie zawiera sekretow, connection stringow ani surowych bledow Postgresa.
- [ ] UI nie pokazuje stack trace uzytkownikowi.

## 11. Pass/Fail Release Decision

Blockery release:

- public submit nie tworzy pending requestu;
- pending nie pojawia sie operatorowi bez F5 w oczekiwanym czasie;
- operator nie moze approve/start/done/skip/reject;
- public join nie widzi statusu wlasnego requestu po approve/reject/start/done/skip;
- public queue pokazuje pending albo prywatne notatki;
- unauthorized/foreign user moze obslugiwac kolejke;
- platform owner support operation nie jest audytowana;
- lifecycle action wisi bez konca albo zostawia przyciski disabled;
- sekrety albo stack trace trafiaja do UI/API response.

Akceptowalne ostrzezenia, jesli sa opisane w release notes:

- realtime listy eventow w dashboardzie odswieza sie przez safe refresh, nie przez natychmiastowy stream;
- opoznienie statusu public join wynosi kilka sekund;
- manualny refresh jest potrzebny po odzyskaniu sieci;
- event-specific public slug routes sa nadal placeholderami, jesli nie sa czescia release.

Evidence do zebrania:

- link do zielonego CI;
- screenshot public join po submit;
- screenshot dashboard pending;
- screenshot public queue po approve/start;
- screenshot lifecycle pause/resume;
- fragment logu API albo request IDs dla mutacji;
- wynik SQL audit logu dla platform owner support, jesli dotyczy;
- notatka kto wykonuje QA i kto akceptuje release.

Sign-off:

- [ ] QA wykonane przez: `...`
- [ ] Product/operator sign-off: `...`
- [ ] Engineering sign-off: `...`
- [ ] Data/migration risk zaakceptowany: `...`

## 12. Quick Demo Script

Scenariusz 5-10 minut:

1. Pokaz public venue: `http://localhost:3000/demo-klub`.
2. Pokaz join page i wyslij request jako uczestnik.
3. Pokaz dashboard events: `http://localhost:3001/dashboard/events`.
4. Otworz kolejke eventu przez `Otworz kolejke`.
5. Pokaz pending request, kliknij `Approve`.
6. Pokaz public queue: request jest w kolejce, pending nie byl publiczny.
7. Kliknij `Start`; uczestnik widzi "Teraz twoja kolej".
8. Kliknij `Done`; uczestnik widzi koncowy status.
9. Wyslij drugi request i pokaz `Reject` albo `Skip`.
10. Kliknij `Pause`; public join blokuje formularz.
11. Kliknij `Resume`; public join wraca dla aktywnego eventu.
12. Na koniec kliknij `Close` albo zostaw event aktywny, zgodnie z celem demo.

Po demo zapisz:

- co dzialalo;
- gdzie bylo opoznienie;
- czy byl potrzebny manual refresh;
- czy wystapily bledy w konsoli;
- czy trzeba odtworzyc dane demo przez `pnpm db:seed:demo`.
