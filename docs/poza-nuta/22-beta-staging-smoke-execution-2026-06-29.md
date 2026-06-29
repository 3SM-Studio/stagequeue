# Beta Staging Smoke Execution - 2026-06-29

## 1. Release Candidate

| Field | Value |
|---|---|
| Branch | `beta-staging-smoke-execution-2026-06-29` |
| Commit SHA | `ea7feede298de03799260b58ba1394585f959e27` |
| Executed at | `2026-06-29T14:39:54+02:00` |
| Environment | staging |
| Public web | `https://public.stage.nedi.me` |
| Dashboard web | `https://dashboard.stage.nedi.me` |
| API | `https://api.stage.nedi.me` |
| Runbook | `21-beta-staging-smoke-runbook.md` |

Ten raport nie zawiera cookies, tokenow OAuth, sekretow, connection strings ani pelnych invite URL-i.

## 2. Execution Constraints

| Constraint | Result | Evidence / notes |
|---|---|---|
| Working tree clean before execution | PASS | Preflight przed utworzeniem raportu |
| Local Docker full-stack | BLOCKED | Docker daemon/server nie jest osiagalny; zgodnie z poleceniem nie probowano go naprawiac |
| In-app Browser automation | PASS | Public participant tab became available and verified the invite gate; dashboard auth remained human-operated |
| Clean participant browser context | PASS | Human otworzyl participant session w incognito bez invite |
| Operator account | PASS | Human zalogowal sie przez Google OAuth i otworzyl event `test qr` |
| Mobile device | PASS | Physical mobile was used for QR claim and participant access persistence |

## 3. Staging Preflight Evidence

| Check | Result | Actual evidence |
|---|---|---|
| API health | PASS | `GET /health` -> 200; service `poza-nuta-api`; environment `production`; DB healthy |
| HTTPS public web | PASS | Event landing -> 200 over HTTPS |
| HTTPS participant session | PASS | Event session -> 200 over HTTPS |
| HTTPS dashboard | PASS | Dashboard root reachable; final unauthenticated route `/sign-in` -> 200 |
| Allowed public CORS origin | PASS | API returned matching public origin and `Access-Control-Allow-Credentials: true` |
| Allowed dashboard CORS origin | PASS | API returned matching dashboard origin and `Access-Control-Allow-Credentials: true` |
| Dashboard OAuth login | PASS | Human potwierdzil Google OAuth login oraz dostep do eventu `test qr` |
| Event landing route | PASS | `/event/Q5fq5NVo3IU` -> 200; server HTML contains event and venue context |
| Participant session route | PASS | `/event/Q5fq5NVo3IU/session` -> 200 |
| Standalone public queue route | PASS | `/event/Q5fq5NVo3IU/queue` -> controlled 404 |
| Log redaction | NOT RUN | No staging log access supplied |
| Same release across services | NOT RUN | No deployment SHA/version endpoint or deployment evidence supplied |

## 4. Observed Event State

Public API evidence for event `Q5fq5NVo3IU` at execution time:

| Field | Observed value |
|---|---|
| Event name | `test qr` |
| Venue | `Demo Klub`, Warszawa |
| Status | `active` |
| Visibility | `public` |
| `publicJoinEnabled` | `true` |
| `joinAccessMode` | `open` |
| Effective submissions | enabled |
| `publicQueueEnabled` | `false` |
| Effective public queue | hidden; reason `PUBLIC_QUEUE_DISABLED` |
| Public queue API | 403 |
| Public SSE stream | 403 |
| Internal event ID in public detail | absent |
| Invite code in public detail | absent |

This differs from the initial reported observation that submissions were closed. At execution time the event
was suitable for an open-submit attempt, but its queue and public SSE stream were disabled. No configuration was
changed from this docs-only branch.

At `2026-06-29T14:50:48+02:00` the human operator confirmed `publicQueueEnabled=on`. A fresh public DTO then
showed active/open submissions and a visible public queue. The public queue snapshot returned successfully and
the event-scoped stream returned a public `connected` frame. This initial HTTP probe did not capture a raw domain
update frame; the subsequent human open-flow evidence confirmed event-driven UI updates without refresh.

Dashboard evidence reported by the authenticated human operator:

- lifecycle status `active` with `Pause` and `Close`;
- invite/QR panel with rotate and revoke actions;
- operator queue sections `Now`, `Pending`, `Approved` and `Done`;
- dashboard SSE badge `Live`;
- no dashboard control for `joinAccessMode` (`open` / `invite_required`).

The active raw invite was visible to the authorized operator but was not copied into evidence. The final revoke
completed the staging invite cleanup after QA.

## 5. Scenario Results

| Scenario | Environment | Commit SHA | Actor/browser | Result | Evidence link/path | Notes | Follow-up issue/branch |
|---|---|---|---|---|---|---|---|
| Public landing | staging | `ea7feed` | unauthenticated HTTP probe | PASS | This report, section 3 | Event and venue context returned over HTTPS |  |
| Participant session route | staging | `ea7feed` | unauthenticated HTTP probe | PASS | This report, section 3 | Route reachable; rendered interaction not verified |  |
| Standalone public queue route | staging | `ea7feed` | unauthenticated HTTP probe | PASS | This report, section 3 | Controlled 404 |  |
| Open event end-to-end | staging | `ea7feed` | incognito participant + authenticated operator | PASS | Human report at `2026-06-29T15:05:15+02:00` | Submit without invite; pending without F5; approve/start/done and myRequests updated without refresh; both badges Live |  |
| Dashboard operator access | staging | `ea7feed` | authenticated human operator | PASS | This report, section 4 | OAuth, event access, queue controls and dashboard Live badge confirmed |  |
| Invite-required without access | staging | `ea7feed` | clean in-app participant + HTTP probe | PASS | In-app screenshot + public API probes | Gate visible, no JoinForm, queue visible, Live badge, backend submit returned 403 ACCESS_REQUIRED | `fix/dashboard-event-join-access-mode-control` |
| Invite claim via QR | staging | `ea7feed` | physical mobile Participant A + operator | PASS | Human mobile report | QR redirect to session without code in destination URL; JoinForm, submit, myRequests, refresh persistence and operator pending passed |  |
| Closed submissions | staging | `ea7feed` | incognito participant + operator + HTTP probe | PASS | Human report + backend probes | Fresh landing/session/backend showed closed submissions; queue remained visible; submit returned 409 | `fix/public-closed-event-cta-copy` |
| Rotate invite | staging | `ea7feed` | mobile Participant A + clean Participant B + operator | PASS | Human report | Rotate succeeded; old invite blocked; new invite claimed; A access preserved |  |
| Revoke invite | staging | `ea7feed` | Participants A/B/C + operator | PASS | Human report | Revoke succeeded; clean C blocked; A/B access preserved; active invite absent |  |
| SSE single stream / no polling | staging | `ea7feed` | incognito participant | PASS | Human DevTools report | One event-scoped stream remained active; no repeated snapshot fetch loop was observed while idle |  |
| SSE forced reconnect | staging | `ea7feed` | incognito participant | BLOCKED | Human DevTools report | Offline toggle did not terminate the existing stream, so disconnect, reconnect and post-reconnect snapshot were not observed | `test/staging-sse-forced-reconnect` |
| Redis fanout | multi-instance staging | `ea7feed` | participant + operator | NOT RUN |  | Instance count/routing evidence not supplied; needs staging engineering owner |  |
| Mobile QR/cookie | staging | `ea7feed` | physical mobile Participant A | PASS | Human mobile report | Physical QR scan and access persistence after refresh; no secret values recorded |  |

## 6. Evidence Still Required

P0 evidence missing before beta GO:

- forced SSE disconnect followed by native reconnect back to `Live`; event-driven updates, one stream and no
  polling already passed;

P1 evidence missing:

- staging log redaction;
- deployment SHA parity across public web, dashboard and API;
- multi-instance Redis fanout and sanitized public `{ type, at }` payload.

## 7. Human Execution Summary

Open-event evidence reported by the human:

- incognito participant session opened without invite: `PASS`;
- `JoinForm` visible: `PASS`;
- submit from incognito: `PASS`;
- current event is confirmed as `open`, not `invite_required`;
- pending appeared in operator queue without F5: `PASS`;
- approve, start and done updated participant state without refresh: `PASS`;
- myRequests showed the request and status changes: `PASS`;
- dashboard and participant SSE badges remained `Live`: `PASS`;
- no manual refresh/F5 was required during the open flow.

Invite-required without-access evidence for event `M7CEt14tw9I`:

- protected operator PATCH returned 200 with `joinAccessMode=invite_required`: `PASS`;
- public detail returned active/public/invite-required and `ACCESS_REQUIRED`: `PASS`;
- clean participant session showed `Wymagane zaproszenie`: `PASS`;
- `JoinForm` count was zero: `PASS`;
- public queue remained visible and participant badge showed `Live`: `PASS`;
- unauthenticated submit returned `403 ACCESS_REQUIRED`: `PASS`;
- public detail exposed neither internal event ID nor invite code: `PASS`;
- in-app screenshot was captured for the execution session and was not committed to the repository;
- no console warning/error was observed on the gate page.

Invite claim evidence:

- physical mobile QR scan used for Participant A: `PASS`;
- redirect ended at `/event/M7CEt14tw9I/session` without invite code: `PASS`;
- `JoinForm`, submit and myRequests after claim: `PASS`;
- access remained after participant refresh: `PASS`;
- pending appeared in operator queue without F5: `PASS`;
- no invite URL, invite code, QR payload, cookie or headers were recorded;
- Participant A remained available for rotate/revoke access-preservation checks.

Rotate evidence:

- operator rotate succeeded: `PASS`;
- old invite was blocked for clean Participant B: `PASS`;
- new invite claimed access for Participant B: `PASS`;
- destination URL contained no invite code and Participant B saw `JoinForm`: `PASS`;
- Participant A retained access after rotate: `PASS`;
- no old/new invite value, QR payload, cookie or headers were recorded;
- Participants A and B remained available for revoke access-preservation checks.

Revoke evidence:

- operator revoke succeeded: `PASS`;
- revoked invite was blocked for clean Participant C: `PASS`;
- Participants A and B retained access after refresh: `PASS`;
- dashboard showed no active invite after revoke: `PASS`;
- revoke was used as cleanup for the active staging invite;
- no invite value, QR payload, cookie or headers were recorded.

Closed-submissions evidence:

- dashboard `Close` succeeded and status became `closed`: `PASS`;
- participant session updated without F5: `PASS`;
- `JoinForm` disappeared: `PASS`;
- queue remained visible: `PASS`;
- fresh public detail returned `status=closed`, submissions disabled with `EVENT_NOT_ACTIVE`: `PASS`;
- unauthenticated submit returned controlled `409 CONFLICT`: `PASS`;
- public queue returned 200 with event `closed` and submissions disabled: `PASS`;
- fresh landing showed `Wydarzenie zakonczone`, closed submissions and visible public queue: `PASS`;
- the earlier landing mismatch was a stale already-open tab, not a fresh-render failure;
- CTA `Zobacz sesje` and the visual emphasis of the closed state were considered ambiguous but non-blocking.

## 8. Bugs and Follow-ups

No backend access-policy bug was proven. The operator reported two non-blocking UX gaps: the irreversible
`Close` action had no confirmation step, and the closed landing CTA/state could be more explicit.

Current blockers and non-blocking follow-ups:

- proposed `chore/staging-release-version-evidence`: expose or document safe deployment SHA evidence;
- proposed `chore/staging-multi-instance-smoke`: coordinate instance routing and Redis fanout evidence;
- proposed `fix/dashboard-event-join-access-mode-control`: provide an authorized operator path to configure
  `open` versus `invite_required`, if product policy confirms operators should control it.
- proposed `test/staging-sse-forced-reconnect`: define a reliable staging-safe way to terminate the participant
  SSE connection and observe native reconnect without introducing polling.
- proposed `fix/dashboard-close-event-confirmation`: add an explicit confirmation step for the irreversible
  operator `Close` action; current staging UI closed the event immediately.
- proposed `fix/public-closed-event-cta-copy`: make the closed state more prominent and replace or clarify the
  ambiguous `Zobacz sesje` CTA without changing closed access semantics.

These are proposed follow-ups only. No branch was created and no runtime fix was made.

## 9. Beta Decision

**BLOCKED**

Public reachability, health, HTTPS, CORS, controlled queue-route behavior, open flow, closed flow,
invite-required gate/claim, mobile QR, rotate and revoke passed. Required reconnect P0 evidence is incomplete:
the attempted DevTools offline method did not terminate the existing SSE stream. Multi-instance Redis fanout,
staging log redaction and deployment SHA parity also remain unverified. This report must not be used as beta GO.
