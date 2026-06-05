# Runbook — Deployment and Rollback

## Pre-deploy

- CI green.
- Migration reviewed.
- Env vars configured.
- Feature flags ready.
- Rollback path known.
- Monitoring checked.

## Deploy

1. Deploy compatible migration first if needed.
2. Deploy application.
3. Verify health checks.
4. Verify key user flows.
5. Monitor logs/errors/metrics.

## Rollback

1. Identify bad version/change.
2. Disable feature flag if available.
3. Roll back app code.
4. Assess database compatibility.
5. If data correction is required, write a reviewed corrective migration/script.
6. Document incident/change.

## Dangerous cases

- destructive migration already applied;
- data transformed irreversibly;
- external emails/webhooks already sent;
- clients depend on changed public API.

## v3 rollback rule

Before deploy, know whether rollback is code rollback, feature flag disable, traffic switch, or roll-forward migration. If DB migration is not reversible, state that explicitly in release plan.
