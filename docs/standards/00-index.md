# 00 — Engineering Standards Index

This directory defines how a senior full-stack developer should think, build, review, test, deploy and operate software in 2026.

## Reading order

1. `01-senior-engineering-mindset.md` — how to think and behave.
2. `02-engineering-principles.md` — non-negotiable engineering principles.
3. `03-repo-structure-naming-comments.md` — names, files, folders and comments.
4. `04-api-design.md` — HTTP contracts, errors, pagination and idempotency.
5. `05-database-data-modeling.md` — relational model, migrations and concurrency.
6. `06-security-auth-privacy.md` — security baseline, auth, passwords, privacy.
7. `07-frontend-architecture.md` — React/Next.js, state, forms, rendering, design.
8. `08-backend-architecture.md` — Fastify, Python, services, repositories, jobs.
9. `09-realtime-background-jobs.md` — polling, SSE, WebSocket, queues, outbox.
10. `10-testing-quality.md` — test strategy and test data.
11. `11-ci-cd-release-deployment.md` — pipelines, environments, releases, rollback.
12. `12-observability-incidents-backups.md` — logs, metrics, traces, incidents, backups.
13. `13-dependencies-licenses-ai.md` — dependencies, licenses, AI-assisted development.
14. `14-documentation-onboarding.md` — docs, ADRs, runbooks and onboarding.
15. `15-definition-of-done-review-checklists.md` — merge gate and review checklists.
16. `16-performance-scalability.md` — frontend/backend performance and scaling.
17. `17-accessibility-i18n-ux.md` — accessibility, localization and UX quality.
18. `18-source-map-and-review-policy.md` — source map and review cadence.

## Layer separation

General standards belong here. Project-specific decisions do not. Project decisions belong in ADRs and project supplements, for example `docs/poza-nuta/`.

## Rule language

- `MUST`: required.
- `SHOULD`: recommended default.
- `MAY`: allowed.
- `MUST NOT`: forbidden by default.

Exceptions require an ADR or a PR note explaining the trade-off.

## v3 enforcement artifacts

Use these with the standards:

- `docs/checklists/api-endpoint-checklist.md`
- `docs/checklists/backend-endpoint-checklist.md`
- `docs/checklists/frontend-feature-checklist.md`
- `docs/checklists/database-migration-checklist.md`
- `docs/checklists/security-review-checklist.md`
- `docs/checklists/dependency-addition-checklist.md`
- `docs/checklists/release-checklist.md`
- `docs/checklists/realtime-change-checklist.md`
- `docs/checklists/incident-response-checklist.md`
- `.github/pull_request_template.md`
- `.github/workflows/ci.example.yml`
