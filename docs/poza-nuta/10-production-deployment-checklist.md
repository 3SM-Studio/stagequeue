# Poza Nuta - Production Deployment Checklist

Ta checklista dotyczy produkcyjnego deploymentu Stagequeue / Poza Nuta. Nie zastępuje CI ani testów, tylko porządkuje ręczne bramki przed i po release.

## 1. Required Production Environment Variables

- [ ] `NODE_ENV=production`
- [ ] `DATABASE_URL` ustawiony na produkcyjny Postgres, nie localhost.
- [ ] `AUTH_SECRET` ustawiony na losowy sekret produkcyjny, minimum 32 znaki.
- [ ] `PARTICIPANT_TOKEN_SECRET` ustawiony na osobny losowy sekret, minimum 32 znaki.
- [ ] `GOOGLE_CLIENT_ID` ustawiony dla produkcyjnej aplikacji OAuth.
- [ ] `GOOGLE_CLIENT_SECRET` ustawiony dla produkcyjnej aplikacji OAuth.
- [ ] `API_URL` ustawiony na publiczny HTTPS URL API.
- [ ] `PUBLIC_WEB_URL` ustawiony na publiczny HTTPS URL public-web.
- [ ] `DASHBOARD_WEB_URL` ustawiony na publiczny HTTPS URL dashboard-web.
- [ ] `PLATFORM_SETUP_TOKEN` ustawiony, jeśli `PLATFORM_SETUP_ENABLED=true`.
- [ ] `COOKIE_DOMAIN` ustawiony zgodnie z produkcyjnymi domenami, jeśli sesje mają działać między subdomenami.
- [ ] `API_INTERNAL_URL` ustawiony tylko dla server-side web app, jeśli hosting używa wewnętrznej sieci do API.

## 2. Secrets Policy

- [ ] Żadne sekrety nie są zapisane w repozytorium, commitach, issue, PR-ach ani logach.
- [ ] `.env.example` zawiera tylko puste wartości albo bezpieczne placeholdery.
- [ ] Sekrety są przechowywane wyłącznie w hostingu, GitHub Secrets albo secret managerze.
- [ ] Po incydencie albo podejrzeniu wycieku wykonano rotację sekretów.
- [ ] GitHub Secret Protection jest włączone dla repozytorium.
- [ ] Gitleaks przechodzi w GitHub Actions.
- [ ] Alerty secret scanning są zamknięte albo mają opisane świadome false positive.

## 3. Google OAuth

- [ ] Google OAuth client jest produkcyjny, nie testowy.
- [ ] OAuth consent screen jest sprawdzony i gotowy dla docelowych użytkowników.
- [ ] Authorized JavaScript origins obejmują produkcyjne domeny dashboard/public, jeśli Google tego wymaga.
- [ ] Authorized redirect URI obejmuje produkcyjny Better Auth callback API, np. `https://api.example.com/auth/callback/google`.
- [ ] Dashboard login wraca na produkcyjny `DASHBOARD_WEB_URL`.
- [ ] Nie używamy testowego `GOOGLE_CLIENT_SECRET` w publicznym repo ani w produkcji.
- [ ] Po wycieku `GOOGLE_CLIENT_SECRET` został zrotowany w Google Cloud Console i w hostingu.

## 4. URLs, CORS, Cookies

- [ ] `API_URL` używa HTTPS i wskazuje publiczne API.
- [ ] `PUBLIC_WEB_URL` używa HTTPS i wskazuje publiczną aplikację uczestnika.
- [ ] `DASHBOARD_WEB_URL` używa HTTPS i wskazuje dashboard.
- [ ] `API_INTERNAL_URL`, jeśli używany, jest osiągalny tylko po stronie server-side i nie jest wymagany w przeglądarce.
- [ ] CORS allowlist zawiera produkcyjne `PUBLIC_WEB_URL` i `DASHBOARD_WEB_URL`.
- [ ] CORS nie używa wildcard `*` razem z credentials.
- [ ] Cookie sesyjne Better Auth działa z `credentials: include`.
- [ ] Cookie sesyjne i participant cookie działają po HTTPS.
- [ ] `COOKIE_DOMAIN` nie wskazuje localhost w produkcji.
- [ ] Public SSE i dashboard SSE zwracają poprawne CORS headers dla dozwolonych origins.

## 5. Database and Migrations

- [ ] Wykonano backup produkcyjnej bazy przed release.
- [ ] Migracje Drizzle są zreviewowane.
- [ ] Migracje są uruchomione przed startem nowej wersji aplikacji, jeśli nowy kod wymaga nowej schemy.
- [ ] Tabela `platform_support_audit_events` istnieje po migracjach.
- [ ] Nie cofamy migracji bez jawnego rollback planu i decyzji właściciela release.
- [ ] W razie problemu preferujemy rollback aplikacji albo roll-forward migracji.
- [ ] `/health` po migracji zwraca poprawny status API i DB.
- [ ] Weryfikujemy, że produkcyjne `DATABASE_URL` nie wskazuje lokalnej albo testowej bazy.

## 6. CI and Security Gates Before Release

- [ ] GitHub Actions workflow `Repository CI` jest zielony.
- [ ] Required check `Repository CI / Quality gates` jest zielony.
- [ ] Branch protection dla `main` jest aktywne.
- [ ] PR review jest wykonany zgodnie z Definition of Done.
- [ ] Dependabot alerts są zamknięte albo mają opisane ryzyko i decyzję.
- [ ] Secret scanning alerts są zamknięte.
- [ ] Gitleaks jest zielony.
- [ ] `pnpm check:clean-package` przechodzi lokalnie albo w CI.
- [ ] Release nie zawiera `.env`, dumpów DB, `node_modules`, `.next`, `dist`, `coverage` ani logów.

## 7. Smoke Checks After Deployment

- [ ] API `/health` zwraca OK i `db.ok=true`.
- [ ] Dashboard login przez Google działa.
- [ ] `/setup` działa, jeśli first-owner setup jest aktywny.
- [ ] `/setup` nie pokazuje token form po zakończeniu setupu.
- [ ] Public venue page ładuje widoczny lokal.
- [ ] Public join request tworzy pending request.
- [ ] Operator queue ładuje pending/approved/now/history.
- [ ] Operator może approve request.
- [ ] Operator może start request.
- [ ] Operator może done request.
- [ ] SSE live update działa dla public queue albo dashboard operator queue.
- [ ] Public queue pokazuje tylko dozwolone publicznie dane i respektuje `publicQueueEnabled`.

## 8. Manual QA Karaoke / Live Flow

- [ ] Otwórz public page uczestnika w jednej przeglądarce albo sesji.
- [ ] Otwórz dashboard operatora w drugiej przeglądarce albo sesji.
- [ ] Uczestnik wysyła request przez public join.
- [ ] Request pojawia się operatorowi bez ręcznego reloadu albo przez bezpieczny refresh w oczekiwanym czasie.
- [ ] Operator wykonuje approve.
- [ ] Uczestnik widzi status approved przez participant cookie / my-requests.
- [ ] Operator wykonuje start.
- [ ] Uczestnik widzi status now.
- [ ] Operator wykonuje done, skip albo reject.
- [ ] Uczestnik widzi właściwy końcowy status.
- [ ] Operator wykonuje pause i resume eventu.
- [ ] Public join blokuje i odblokowuje formularz zgodnie ze statusem eventu.
- [ ] Operator wykonuje close eventu.
- [ ] Public queue/join pokazują właściwy stan po zamknięciu.

## 9. Rollback Checklist

- [ ] Określ, czy problem wymaga rollback aplikacji, roll-forward fixu, czy wyłączenia funkcji.
- [ ] Cofnij release aplikacji do poprzedniej wersji, jeśli to najbezpieczniejsze.
- [ ] Nie cofaj migracji DB bez osobnego, zaakceptowanego rollback planu.
- [ ] Sprawdź, czy audit log `platform_support_audit_events` nadal przyjmuje wpisy po rollbacku aplikacji.
- [ ] Sprawdź error logi API i hostingu.
- [ ] Ponownie uruchom smoke checks po rollbacku.
- [ ] Udokumentuj, które dane użytkowników albo queue/events mogły zostać zmienione podczas incydentu.

## 10. Release Notes

Release notes muszą zawierać:

- [ ] Co się zmieniło dla użytkownika, operatora albo admina.
- [ ] Jakie migracje DB są częścią release.
- [ ] Jakie zmienne środowiskowe dodano, zmieniono albo usunięto.
- [ ] Jakie są znane ryzyka i ograniczenia.
- [ ] Wynik manual QA karaoke/live flow.
- [ ] Wynik smoke checks po deployment.
- [ ] Rollback/roll-forward plan.
- [ ] Informację, czy release dotyka auth, permissions, audit, public API, SSE albo queue operations.
