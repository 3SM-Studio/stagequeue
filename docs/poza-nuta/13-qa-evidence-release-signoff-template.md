# Poza Nuta - QA Evidence / Release Sign-off Template

Skopiuj ten dokument dla konkretnego release albo demo i wypelnij po przejsciu `12-live-karaoke-manual-qa-playbook.md`. To jest raport dowodowy, nie playbook. Nie wpisuj sekretow, tokenow, pelnych cookie ani prywatnych danych uczestnikow.

Dla beta staging session/invite flow wykonaj kroki z `21-beta-staging-smoke-runbook.md` i przenies tutaj tylko
bezpieczne referencje do evidence.

## 1. Release / Demo Metadata

| Field | Value |
|---|---|
| Release/demo name |  |
| Date |  |
| Tester |  |
| Approver |  |
| Branch |  |
| Commit SHA |  |
| Environment | local / staging / production |
| API URL |  |
| Public web URL |  |
| Dashboard web URL |  |
| Database |  |
| DB migration version / last migration |  |
| Data seed used | none / demo / staging fixture / production data |
| Related PR / CI run |  |

Notes:

- 

## 2. CI / Security Evidence

| Check | Expected | Actual | Pass/Fail | Evidence |
|---|---|---|---|---|
| GitHub Actions `Repository CI / Quality gates` | green |  |  |  |
| `pnpm check:clean-package` | passed |  |  |  |
| Typecheck | passed |  |  |  |
| Tests | passed |  |  |  |
| Build | passed |  |  |  |
| Dependabot alerts | zero or accepted risk |  |  |  |
| Secret scanning alerts | zero open alerts |  |  |  |
| Gitleaks status | green |  |  |  |
| Branch protection | required checks active |  |  |  |

Security notes / accepted risks:

- 

## 3. Smoke Checks

| Smoke check | Expected result | Actual result | Pass/Fail | Evidence / notes |
|---|---|---|---|---|
| API `/health` | API OK, DB OK |  |  |  |
| Public web loads | Discovery and event landing load |  |  |  |
| Dashboard web loads | Dashboard route loads |  |  |  |
| Dashboard login | Google/Better Auth login works |  |  |  |
| `GET /me` | Correct auth/access state |  |  |  |
| DB connection | App can query DB |  |  |  |
| Participant session | `/event/:eventPublicId/session` loads |  |  |  |
| Operator queue page | Event queue loads |  |  |  |

Commands / URLs used:

```txt

```

## 4. Manual QA Results Table

Use one row per scenario from the live karaoke manual QA playbook.

| Scenario | Expected result | Actual result | Pass/Fail | Evidence link / screenshot | Notes |
|---|---|---|---|---|---|
| Pre-flight complete | Required checks and env ready |  |  |  |  |
| Accounts/sessions separated | Operator auth and participant anon session separated |  |  |  |  |
| Event setup valid | Venue/org/event visible and active as expected |  |  |  |  |
| Participant session validation | Missing fields show readable validation errors |  |  |  |  |
| Participant submit | Request created as pending |  |  |  |  |
| Invite-required without access | Landing visible; session gate; backend submit blocked |  |  |  |  |
| Invite claim | Access granted and redirect to `/event/:eventPublicId/session` |  |  |  |  |
| Invite rotate | Old code blocked; new code works; existing access remains |  |  |  |  |
| Invite revoke | New claims blocked; existing access remains |  |  |  |  |
| Closed submissions | No form; backend submit blocked; queue follows public policy |  |  |  |  |
| Operator pending visibility | Pending appears in dashboard without F5 |  |  |  |  |
| Approve/start/done flow | Request moves through approved/now/done |  |  |  |  |
| Reject/skip flow | Rejected/skipped states visible where expected |  |  |  |  |
| Queue move | Approved positions stay dense and ordered |  |  |  |  |
| Public queue visibility | Pending/private notes hidden, now/approved visible |  |  |  |  |
| Lifecycle pause/resume | Join closes/reopens without hard refresh |  |  |  |  |
| Standalone public queue route | `/event/:eventPublicId/queue` returns controlled 404 |  |  |  |  |
| SSE reconnect | Returns to Live with one EventSource and no polling |  |  |  |  |
| Mobile QR flow | QR claim, session submit and myRequests work on mobile |  |  |  |  |
| Failure handling | API/SSE errors are readable and non-fatal |  |  |  |  |

## 5. Live Karaoke Flow Evidence

| Flow step | Evidence captured | Pass/Fail | Notes |
|---|---|---|---|
| Participant submit from event session | Screenshot / request ID / log line |  |  |
| Operator queue update via SSE | Screenshot before/after |  |  |
| Approve request | Screenshot / API request ID |  |  |
| Start request | Screenshot / public status update |  |  |
| Done request | Screenshot / final participant state |  |  |
| Reject request | Screenshot / participant status |  |  |
| Skip request | Screenshot / queue state |  |  |
| Public queue visibility | Screenshot of public queue |  |  |
| Lifecycle pause | Session submit blocked |  |  |
| Lifecycle resume | Session submit restored |  |  |
| Lifecycle close | Submit stopped and queue state correct |  |  |

Key request IDs / logs:

```txt

```

## 6. Security / Permission Evidence

| Scenario | Expected result | Actual result | Pass/Fail | Evidence / notes |
|---|---|---|---|---|
| Unauthenticated dashboard user | Cannot access protected dashboard queue |  |  |  |
| Event staff user | Can operate assigned event queue |  |  |  |
| Foreign user | Gets controlled 403 |  |  |  |
| Platform owner support access | Can perform support operation through explicit support policy |  |  |  |
| Platform owner support audit | Audit row exists in `platform_support_audit_events` |  |  |  |
| Public participant token | Token not exposed in response body or DB plaintext |  |  |  |
| Public my-requests ownership | Participant sees only own requests |  |  |  |
| Public queue privacy | No pending requests or private operator notes visible |  |  |  |

Audit evidence, if DB inspection is available:

```sql
select actor_user_id, target_event_id, operation, permission, access_type, outcome, created_at
from platform_support_audit_events
order by created_at desc
limit 20;
```

Result summary:

```txt

```

## 7. Known Issues

| Severity | Issue | Blocker? | Workaround | Owner | Target follow-up |
|---|---|---|---|---|---|
| blocker / non-blocker |  | yes / no |  |  |  |

Blocker definition:

- breaks public submit;
- breaks operator queue actions;
- leaks private queue data;
- allows unauthorized dashboard access;
- leaves lifecycle mutation hanging;
- exposes secrets, stack traces, tokens or raw DB errors.

Non-blocker examples:

- SSE reconnect delay is visible but within expected range;
- manual refresh is needed after network recovery;
- cosmetic UI issue without data/security impact.

## 8. Release Decision

Decision:

- [ ] GO
- [ ] NO-GO

| Field | Value |
|---|---|
| Approver |  |
| Timestamp |  |
| Rollback owner |  |
| Rollback notes |  |
| Migration rollback decision | keep migration / rollback plan exists / not applicable |
| Follow-up issues created |  |

Decision rationale:

- 

## 9. Post-release Checks

Run these after deployment or demo handoff.

| Check | Expected result | Actual result | Pass/Fail | Evidence / notes |
|---|---|---|---|---|
| API health | `/health` OK and DB OK |  |  |  |
| Error logs | No new critical errors |  |  |  |
| Auth logs | No unexpected login/setup errors |  |  |  |
| Public web | Discovery, event landing, and participant session reachable; standalone queue returns 404 |  |  |  |
| Dashboard web | Dashboard/events/queue reachable |  |  |  |
| Live queue flow | One smoke participant request works |  |  |  |
| SSE / reconnect | Updates arrive and reconnect restores live state |  |  |  |
| User-visible regressions | None reported |  |  |  |
| Audit log | Platform support audit still records events |  |  |  |

Post-release notes:

- 

## Final Attachments

Link evidence here:

- CI run:
- Deployment:
- Screenshots:
- Logs:
- DB/audit evidence:
- Release notes:
