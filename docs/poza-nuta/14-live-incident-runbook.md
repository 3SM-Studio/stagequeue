# Poza Nuta - Live Incident Runbook

Ten runbook jest instrukcja awaryjna dla operatora i dev/support podczas karaoke night. Celem jest utrzymanie wieczoru, ochrona danych kolejki i szybka decyzja: kontynuujemy systemem czy przechodzimy na tryb manualny.

Nie wpisuj sekretow, tokenow, pelnych cookie, connection stringow ani danych prywatnych uczestnikow do czatu, ticketow, screenshotow ani komunikatow dla lokalu.

## 1. Triage w pierwszych 2 minutach

1. Nazwij problem jednym zdaniem:
   - API down;
   - dashboard nie dziala;
   - public join nie dziala;
   - public queue nie dziala;
   - SSE/live update nie dziala;
   - login operatora nie dziala;
   - queue data wyglada niespojnie.
2. Ustal blast radius:
   - tylko jedna karta/przegladarka;
   - tylko operator;
   - tylko uczestnicy;
   - caly lokal;
   - wiele lokali/srodowisko produkcyjne.
3. Sprawdz, czy kolejka jest nadal czytelna w dashboardzie.
4. Jesli kolejka nie jest czytelna, natychmiast rozpocznij papierowa/notatkowa kolejke awaryjna.
5. Zrob szybka decyzje GO/NO-GO:
   - GO systemem: podstawowe akcje operatora dzialaja;
   - GO manualnie: system nie jest stabilny, ale event moze trwac na papierze;
   - NO-GO: brak mozliwosci bezpiecznego prowadzenia kolejki.
6. Zapisz czas startu incydentu i osobe koordynujaca.

Minimalna notatka incydentu:

```txt
Time:
Environment:
Venue/event:
Symptom:
Current mode: system / manual / paused
Operator:
Support:
```

## 2. Severity Levels

### SEV1 - live event blocked

Przyklady:

- operator nie moze zobaczyc kolejki ani wykonac akcji;
- queue data jest potencjalnie uszkodzona albo nie wiadomo, kto jest nastepny;
- public submit zalewa system albo ujawnia cudze dane;
- unauthorized user moze obslugiwac kolejke;
- DB/API jest niedostepne dla calego eventu.

Decyzja:

- przejdz na kolejke papierowa/notatkowa, jesli event ma trwac;
- nie resetuj DB;
- eskaluj do dev/support natychmiast;
- po recovery wykonaj data safety check przed powrotem do systemu.

### SEV2 - degraded live flow

Przyklady:

- SSE/live update nie dziala, ale manual refresh dziala;
- public join dziala, ale status uczestnika odswieza sie z opoznieniem;
- dashboard listy eventow wymaga recznego refreshu;
- pojedyncza akcja operatora timeoutuje, ale ponowienie po refreshu dziala.

Decyzja:

- kontynuuj systemem z manual refresh fallback;
- operator komunikuje opoznienia uczestnikom;
- support obserwuje logi i health.

### SEV3 - non-blocking issue

Przyklady:

- kosmetyczny blad UI;
- pojedynczy screenshot/log nieczytelny;
- wolniejszy refresh bez utraty danych;
- blad w demo flow, ktory ma prosty workaround.

Decyzja:

- kontynuuj systemem;
- zapisz follow-up po evencie.

## 3. Immediate Operator Workarounds

- Uzyj przycisku `Odswiez` / `Odswiez kolejke`.
- Odswiez strone przegladarki tylko jesli przyciski nie sa w trakcie aktywnej mutacji.
- Jesli public join nie dziala, przyjmuj zgloszenia ustnie i zapisuj je w papierowej/notatkowej kolejce.
- Jesli dashboard nie dziala, prowadz kolejke manualnie:
  - imie;
  - tytul;
  - artysta;
  - status: pending / approved / now / done / skipped / rejected;
  - czas dodania.
- Jesli public queue nie dziala, prowadzacy oglasza aktualna i nastepna osobe glosowo.
- Jesli login operatora nie dziala, sprawdz czy inny uprawniony operator ma aktywna sesje.
- Nie uzywaj prywatnych tokenow ani cudzych sesji jako workaround.

Szablon kolejki awaryjnej:

```txt
Now:

Approved:
1.
2.
3.

Pending:
-
-

Done/skipped/rejected:
-
```

## 4. API / DB Checks

Najpierw sprawdz bezpieczne read-only sygnaly:

- API `/health`;
- logi aplikacji API;
- status hostingu;
- status bazy;
- czy ostatnie requesty operatora maja odpowiedzi 2xx/4xx/5xx;
- czy nie ma serii timeoutow.

Lokalnie:

```bash
pnpm smoke:api
```

Albo bez zostawiania sekretow w output:

```bash
curl https://<api-host>/health
```

DB safety:

- nie wykonuj `docker compose down -v` na srodowisku z realnym eventem;
- nie odpalaj `pnpm db:seed:demo` na produkcji ani na realnej bazie eventu;
- nie czysc tabel queue/events;
- nie cofaj migracji bez zaakceptowanego rollback planu;
- jesli trzeba sprawdzic dane, uzywaj read-only SELECT i zapisuj tylko minimalne wyniki bez danych wrazliwych.

## 5. SSE / Live Update Issues

Objawy:

- operator widzi pending dopiero po refreshu;
- public queue nie aktualizuje sie live;
- public join nie widzi approve/start/done od razu;
- Network pokazuje zerwane EventSource.

Postepowanie:

1. Nie restartuj od razu DB.
2. Uzyj manual refresh w dashboardzie i publicznym widoku.
3. Sprawdz, czy zwykle HTTP akcje operatora dzialaja.
4. Jesli POST/PATCH dzialaja, kontynuuj systemem z manual refresh fallback.
5. Jesli POST/PATCH wisza albo nie dochodza do API, traktuj jako SEV1/SEV2 zalezne od blast radius.
6. Sprawdz CORS tylko przez naglowki i logi, bez wypisywania cookie.
7. Po recovery sprawdz, czy nie ma duplikatow streamow po wielokrotnej nawigacji.

Nie rob:

- nie dodawaj WebSocket hotfixa podczas eventu;
- nie otwieraj wielu kart operator queue jako "monitoringu";
- nie odswiezaj agresywnie co sekunde.

## 6. Dashboard Auth / Login Issues

Objawy:

- operator nie moze wejsc do dashboardu;
- Google OAuth wraca do bledu;
- `/me` pokazuje `authenticated=false`;
- user ma dashboard access denied.

Postepowanie:

1. Sprawdz, czy operator ma aktywna sesje w innej przegladarce.
2. Sprawdz `DASHBOARD_WEB_URL`, `API_URL`, CORS i cookie domain w srodowisku.
3. Sprawdz, czy Google OAuth nie ma awarii albo zlego redirect URI.
4. Jesli first-owner/setup dotyczy srodowiska, sprawdz `/setup/status`.
5. Jesli user nie ma dostepu, nie obchodz permission layera w UI.
6. Jesli platform owner uzywa support access, po recovery sprawdz audit log.

Awaryjnie:

- jesli nikt nie ma dashboard access, przejdz na kolejke papierowa;
- nie udostepniaj prywatnych kont ani sesji;
- nie dodawaj dev auth bypassa na zywo.

## 7. Public Join / Queue Issues

Public join:

- jesli formularz nie dziala, przyjmuj zgloszenia ustnie i zapisuj pending manualnie;
- jesli rate limit blokuje realnych uczestnikow, nie resetuj tokenow/DB; zapisz objaw i przejdz na manual intake;
- jesli paused/closed status blokuje formularz zgodnie z lifecycle, to nie jest incydent.

Public queue:

- jesli public queue nie dziala, operator/prowadzacy oglasza `now` i `next` glosowo;
- pending nadal nie moze byc ujawniany publicznie;
- prywatne notatki operatora nie moga byc pokazywane na ekranie publicznym;
- jesli public queue pokazuje prywatne dane, traktuj jako SEV1 privacy issue.

Participant status:

- jesli `my-requests` nie odswieza statusu, uczestnik moze pytac prowadzacego;
- operator queue pozostaje source of truth;
- nie probuj identyfikowac uczestnika przez ujawnianie cookie/tokena.

## 8. Queue Data Safety

Zasady:

- source of truth to backend/DB, dopoki API dziala i dane sa spojne;
- w trybie awaryjnym source of truth staje sie papierowa/notatkowa kolejka operatora;
- po przejsciu na manual, nie wykonuj losowych akcji w dashboardzie bez synchronizacji z notatka;
- zachowaj kolejnosc approved queue;
- zapisuj kazde reczne approve/start/done/skip/reject w notatce;
- nie tworz duplikatow requestow w systemie tylko po to, zeby "nadrobic" historie w trakcie eventu.

Przed powrotem z manual do systemu:

1. Ustal aktualne `now`.
2. Ustal pozostale approved w kolejnosci.
3. Ustal pending, ktore maja jeszcze czekac.
4. Porownaj dashboard z notatka.
5. Wykonaj minimalne akcje naprawcze w dashboardzie.
6. Zapisz, co zostalo zrobione recznie.

## 9. Communication

Do operatora/prowadzacego:

- mow prostym statusem: "system dziala", "dzialamy z odswiezaniem recznym", "przechodzimy na kolejke papierowa".
- podaj jedna osobe decyzyjna.
- nie tlumacz szczegolow technicznych uczestnikom.

Do uczestnikow:

- "Zgloszenia chwilowo przyjmujemy u prowadzacego."
- "Kolejka na ekranie moze miec opoznienie; prowadzacy podaje aktualna kolejnosc."
- "Wasze zgloszenia nie zginely, porzadkujemy kolejke."

Do dev/support:

- podaj srodowisko, lokal, event, czas startu, objawy i ostatnia dzialajaca akcje;
- podaj request IDs/log timestamps, jesli sa dostepne;
- nie wysylaj sekretow, cookie, tokenow ani pelnych connection stringow.

## 10. Recovery

Warunki powrotu do systemu:

- API `/health` OK;
- dashboard queue laduje sie;
- operator moze wykonac bezpieczna akcje testowa albo manual refresh;
- public join/queue pokazuje stan zgodny z lifecycle;
- dane kolejki sa zgodne z notatka operatora;
- nie ma aktywnego privacy/security leak.

Kroki:

1. Zatrzymaj dodawanie nowych wpisow do papierowej kolejki na minute.
2. Porownaj system z notatka.
3. Ustal, czy kontynuujecie od systemu czy zostajecie manualnie do konca eventu.
4. Jesli wracacie do systemu, wykonaj tylko minimalne akcje potrzebne do zgodnosci.
5. Sprawdz platform support audit po recovery, jesli platform owner wykonywal support operations.
6. Zapisz czas recovery i aktualny tryb.

Audit check:

```sql
select actor_user_id, target_event_id, operation, permission, access_type, outcome, created_at
from platform_support_audit_events
order by created_at desc
limit 20;
```

## 11. Post-incident Report

Wypelnij po evencie, najlepiej na podstawie `13-qa-evidence-release-signoff-template.md`.

Minimalny raport:

| Field | Value |
|---|---|
| Incident date/time |  |
| Severity | SEV1 / SEV2 / SEV3 |
| Venue/event |  |
| Impact |  |
| Start time |  |
| Recovery time |  |
| Mode used | system / manual / mixed |
| Data correction needed | yes / no |
| Security/privacy impact | yes / no |
| Audit checked | yes / no |
| Owner |  |
| Follow-up issue |  |

Do raportu dolacz:

- timeline;
- screenshoty bez sekretow;
- request IDs albo log timestamps;
- decyzje GO/NO-GO;
- czy kolejka papierowa byla uzyta;
- czy po recovery dane systemowe zgadzaly sie z notatka;
- follow-upy techniczne i produktowe.

## 12. What Not To Do

- Nie resetuj DB w trakcie eventu.
- Nie uruchamiaj seedow demo na realnej bazie.
- Nie wykonuj `docker compose down -v` na srodowisku z danymi eventu.
- Nie usuwaj requestow ani eventow bez jawnej decyzji recovery.
- Nie obchodz permission layera przez UI, dev auth bypass albo wspoldzielenie kont.
- Nie wklejaj sekretow, cookie, tokenow ani connection stringow do Slacka, GitHuba, maila czy screenshotow.
- Nie ukrywaj incydentu, jesli doszlo do privacy/security leak.
- Nie wprowadzaj duzych zmian architektury podczas live eventu.
- Nie przechodzaj z manualnej kolejki z powrotem do systemu bez porownania danych.
- Nie kasuj ani nie nadpisuj audit trail.
- Nie traktuj braku live update jako SEV1, jesli manual refresh i akcje operatora dzialaja.
- Nie traktuj dzialajacego manual refreshu jako pelnego recovery, jesli mutacje operatora nadal timeoutuja.
