# Poza Nuta - Closed Beta Release Evidence - 2026-06-26

This evidence document records what is known for the closed beta release candidate. Do not paste secrets, full cookies, `DATABASE_URL`, `REDIS_URL`, participant tokens, OAuth tokens or full invite codes into this file.

Status values:

- `PASS` - evidence was provided or observed.
- `MISSING` - required evidence has not been provided.
- `NOT RUN` - the check was not executed.
- `N/A` - not applicable for this release candidate.

## 1. Release Candidate SHA

| Field | Value |
|---|---|
| Evidence date | 2026-06-26 |
| Branch | `c19c-beta-release-evidence` |
| Release candidate SHA | `bd7250679c8cd518f7300bcead3195cd3fe1cccc` |
| Source | Local git preflight |
| Status | PASS |
| Notes | Working tree was clean before evidence doc changes. |

## 2. CI Evidence

| Area | Required evidence | Reference | Owner | Status | Notes |
|---|---|---|---|---|---|
| Quality gates | GitHub Actions `Repository CI / Quality gates` green for RC SHA | MISSING | MISSING | MISSING | No CI run link provided. |
| DB migration smoke | GitHub Actions `Repository CI / DB migration smoke` green for RC SHA | MISSING | MISSING | MISSING | No CI run link provided. |
| Dependency/security scan | Audit / dependency gate result for RC SHA | MISSING | MISSING | MISSING | No run evidence provided. |
| Secret scan | Gitleaks / GitHub secret scanning result | MISSING | MISSING | MISSING | No run evidence provided. |

## 3. Env / Secrets Verification

| Area | Required evidence | Reference | Owner | Status | Notes |
|---|---|---|---|---|---|
| `NODE_ENV` | Confirmed `production` in target environment | MISSING | MISSING | MISSING | Do not paste env dump. |
| Database secret | `DATABASE_URL` present in secret manager and not logged | MISSING | MISSING | MISSING | Do not paste value. |
| Redis secret | `REDIS_URL` present in secret manager and not logged | MISSING | MISSING | MISSING | Do not paste value. |
| Auth secrets | `AUTH_SECRET` and `PARTICIPANT_TOKEN_SECRET` present and production-grade | MISSING | MISSING | MISSING | Do not paste values. |
| Platform setup | `PLATFORM_SETUP_TOKEN` present and `BOOTSTRAP_PLATFORM_OWNER_EMAIL` absent in production | MISSING | MISSING | MISSING | Required before beta. |
| Google OAuth | Client id/secret present for target environment | MISSING | MISSING | MISSING | Do not paste secret. |
| Trusted origins | Public/dashboard/API origins reviewed | MISSING | MISSING | MISSING | Include only safe origin names if recorded later. |
| Cookie domain | Production cookie domain and secure cookie assumptions reviewed | MISSING | MISSING | MISSING | No browser evidence provided. |
| DB runtime config | Pool/timeouts/application name reviewed | MISSING | MISSING | MISSING | Values may be recorded if non-secret. |
| Rate limit settings | Global and public submit limits accepted | MISSING | MISSING | MISSING | No release owner acceptance provided. |
| Log level | `API_LOG_LEVEL` confirmed for beta | MISSING | MISSING | MISSING | No env evidence provided. |

## 4. DB Backup / Pre-check / Migration Evidence

| Area | Required evidence | Reference | Owner | Status | Notes |
|---|---|---|---|---|---|
| Backup | Backup ID, timestamp and operator recorded outside repo | MISSING | MISSING | MISSING | Required before production/staging migration. |
| C18b pre-check | All invalid counts are zero | MISSING | MISSING | MISSING | Use SQL from `15-db-backup-migration-runbook.md`. |
| C18c pre-check | All invalid counts are zero | MISSING | MISSING | MISSING | Use SQL from `15-db-backup-migration-runbook.md`. |
| Migration execution | Drizzle migrations applied to target DB | MISSING | MISSING | MISSING | No migration log reference provided. |
| Migration journal | Applied migration journal verified | MISSING | MISSING | MISSING | No DB inspection evidence provided. |
| Constraints validated | C18b/C18c CHECK constraints have `convalidated=true` | MISSING | MISSING | MISSING | No DB inspection evidence provided. |
| Post-migration health | API `/health` OK and DB OK | MISSING | MISSING | MISSING | No health check evidence provided. |
| Restore decision | Restore / rollback decision point recorded | MISSING | MISSING | MISSING | Required before beta GO. |

## 5. Redis Evidence

| Area | Required evidence | Reference | Owner | Status | Notes |
|---|---|---|---|---|---|
| Reachability | Redis reachable from API runtime | MISSING | MISSING | MISSING | No provider/log evidence provided. |
| EventBus/SSE | Redis-backed EventBus selected in target environment | MISSING | MISSING | MISSING | No runtime evidence provided. |
| Rate limit | Redis-backed rate limiter selected in target environment | MISSING | MISSING | MISSING | No runtime evidence provided. |
| Fail-fast | Production without `REDIS_URL` would fail config validation | MISSING | MISSING | MISSING | Code has validation, but target env evidence is missing. |
| Outage behavior | Team accepts SSE degradation and rate-limit fail-closed behavior | MISSING | MISSING | MISSING | Needs release owner acceptance. |
| Monitoring | Basic Redis provider health/error review process exists | MISSING | MISSING | MISSING | No monitoring evidence provided. |

## 6. Auth / Cookie / OAuth Evidence

| Area | Required evidence | Reference | Owner | Status | Notes |
|---|---|---|---|---|---|
| OAuth redirects | Authorized redirect URLs match target API callback | MISSING | MISSING | MISSING | No Google Console evidence provided. |
| Trusted origins | CORS/trusted origins match public/dashboard/API domains | MISSING | MISSING | MISSING | No config review evidence provided. |
| Secure cookies | Secure/httpOnly cookies verified in browser | MISSING | MISSING | MISSING | No browser evidence provided. |
| Cookie domain | Session and participant cookies work on target domains | MISSING | MISSING | MISSING | No browser evidence provided. |
| Participant cookie | `pn_participant` behavior verified without token leakage | MISSING | MISSING | MISSING | No public submit evidence provided. |
| Logout/session | Logout/session behavior verified if available | MISSING | MISSING | MISSING | No dashboard evidence provided. |

## 7. Manual QA Evidence

| Scenario | Required evidence | Reference | Owner | Status | Notes |
|---|---|---|---|---|---|
| Platform owner setup | `/setup` + `PLATFORM_SETUP_TOKEN` flow works | MISSING | MISSING | MISSING | No manual QA evidence provided. |
| Org/venue setup | Organization and venue created/available | MISSING | MISSING | MISSING | No manual QA evidence provided. |
| Venue verification | Verification path checked if applicable | MISSING | MISSING | MISSING | No manual QA evidence provided. |
| Event create/start/open | Event can be created and started/opened | MISSING | MISSING | MISSING | No manual QA evidence provided. |
| Open public submit | Public submit works for open event | MISSING | MISSING | MISSING | No manual QA evidence provided. |
| Invite-required block | Public submit blocked without access | MISSING | MISSING | MISSING | No manual QA evidence provided. |
| Invite claim | Valid invite claim grants access | MISSING | MISSING | MISSING | No manual QA evidence provided. |
| Invite rotate/revoke | Rotate/revoke blocks future claims without revoking existing access | MISSING | MISSING | MISSING | No manual QA evidence provided. |
| Operator queue | Approve/start/done/skip/reject/move verified where supported | MISSING | MISSING | MISSING | No manual QA evidence provided. |
| SSE/refresh | Reconnect or browser refresh remains non-fatal | MISSING | MISSING | MISSING | No manual QA evidence provided. |
| PublicId regression | Public flow does not expose internal UUIDs unexpectedly | MISSING | MISSING | MISSING | No spot-check evidence provided. |
| Mobile submit | Mobile public submit smoke | MISSING | MISSING | MISSING | No mobile evidence provided. |
| Error states | Basic API down/validation/rate-limit/blocked join states | MISSING | MISSING | MISSING | No error-state evidence provided. |

## 8. Observability / Log Redaction Evidence

| Area | Required evidence | Reference | Owner | Status | Notes |
|---|---|---|---|---|---|
| Authorization redaction | Logs redact `Authorization` | MISSING | MISSING | MISSING | No sanitized log sample provided. |
| Cookie redaction | Logs redact `cookie` and `set-cookie` | MISSING | MISSING | MISSING | No sanitized log sample provided. |
| Secret redaction | Logs do not contain DB/Redis URLs or tokens | MISSING | MISSING | MISSING | No sanitized log review evidence provided. |
| Redis EventBus logs | `redis_event_bus_error` event known/observable | MISSING | MISSING | MISSING | No log evidence provided. |
| Redis rate-limit logs | `redis_rate_limit_error` event known/observable | MISSING | MISSING | MISSING | No log evidence provided. |
| DB pool logs | `db_pool_error` event known/observable | MISSING | MISSING | MISSING | No log evidence provided. |
| SSE lifecycle logs | `sse_stream_open`, `sse_stream_close`, `sse_stream_error` known/observable | MISSING | MISSING | MISSING | No log evidence provided. |
| Log level | Runtime log level confirmed | MISSING | MISSING | MISSING | No env/log evidence provided. |

## 9. Rollback / Restore Decision

| Area | Required evidence | Reference | Owner | Status | Notes |
|---|---|---|---|---|---|
| App rollback | Previous deploy/version identified | MISSING | MISSING | MISSING | No deploy reference provided. |
| DB restore | Backup restore policy accepted for this release | MISSING | MISSING | MISSING | No restore decision provided. |
| Migration rollback | Roll-forward vs restore decision point documented | MISSING | MISSING | MISSING | No release owner decision provided. |
| Data cleanup caution | No improvised cleanup without backup/review | MISSING | MISSING | MISSING | Needs release owner acknowledgement. |
| Redis/cache state | Redis state treated as non-source-of-truth | MISSING | MISSING | MISSING | Needs release owner acknowledgement. |

## 10. Known Issues

| Severity | Issue | Blocker? | Workaround | Owner | Target follow-up |
|---|---|---|---|---|---|
| P1 | Required beta release evidence is missing for CI, target env, DB, Redis, auth, manual QA, observability and rollback. | yes | Collect evidence using `19-beta-release-runbook.md` and `13-qa-evidence-release-signoff-template.md`. | MISSING | Before beta GO |

## 11. Final Go / No-Go Decision

Decision: **NO-GO**

Rationale: The release candidate SHA is recorded, but staging/production-like evidence was not provided for the required beta gates. Per C19b criteria, missing CI, env, backup/migration, Redis, auth, manual QA, observability and rollback evidence prevents GO or CONDITIONAL GO.

Required next step: collect real evidence without secrets, update this document or a copied sign-off template, then re-evaluate GO / CONDITIONAL GO / NO-GO.
