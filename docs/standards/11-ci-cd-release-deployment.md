# 11 — CI/CD, Release and Deployment

## CI minimum

MUST run on PR:

```txt
install
format check
lint
typecheck
unit tests
integration tests
build
security/dependency scan
secret scan
```

Add E2E smoke tests for deploy/preview when stable enough.

## Branch protection

Main branch MUST require:

- passing checks;
- review approval;
- no direct pushes;
- no force push;
- up-to-date branch if required by project policy.

## Environments

Define:

```txt
local
preview
staging
production
```

Each environment must have clear config, data, secrets and deployment path.

## Environment variables

MUST document env vars:

```txt
name
required?
example
used by
secret?
default?
```

MUST keep `.env.example` fake and current.

## Release checklist

Before production release:

- CI green;
- migration reviewed;
- rollback path understood;
- feature flags configured;
- env vars present;
- runbook updated if operational behavior changed;
- monitoring/logging ready;
- public API breaking changes documented;
- support/operator docs updated when needed.

## Database migrations

MUST treat schema changes as deployment risk.

Prefer backward-compatible migrations:

- add before use;
- write both if needed;
- backfill safely;
- read new;
- remove old later.

MUST NOT deploy destructive migrations without tested rollback/restore plan.

## Rollback

Every significant release SHOULD answer:

```txt
Can we rollback app code?
Can we rollback database?
Can we disable the feature?
What user data was changed?
```

## Feature flags

Use feature flags for risky releases, gradual rollout or operational kill switches.

MUST remove temporary flags after completion. A stale flag is conditional spaghetti.

## Hotfix flow

Hotfixes still require:

- minimal targeted change;
- test for bug if possible;
- review appropriate to severity;
- post-release follow-up if process was bypassed.

## Release notes

Release notes should mention:

- user-visible changes;
- migrations;
- env changes;
- breaking changes;
- operational notes;
- rollback limitations.

## v3 CI gate

Main branch MUST be protected.
Required checks SHOULD include:

```txt
install
lint
format check
typecheck
unit tests
integration tests
build
e2e smoke where feasible
secret scan
dependency/security review
```

A release MUST identify migrations, feature flags, rollback path, monitoring checks and owner.

MUST NOT deploy irreversible migrations without a roll-forward plan.
