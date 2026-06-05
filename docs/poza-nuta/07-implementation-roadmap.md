# Poza Nutą — Implementation Roadmap Aligned With Standards

## P0 — Make architecture enforceable

- Add standards and supplement to repo.
- Add PR template and Definition of Done.
- Ensure CI runs lint/typecheck/tests/build.
- Keep ADRs linked from supplement.

## P1 — Backend foundation

- Fastify skeleton.
- Environment validation.
- Structured errors.
- Auth/session integration.
- Organization/venue/event permission policies.
- PostgreSQL/Drizzle schema and migrations.

## P2 — Domain and API contracts

- Venue-first event model.
- Event lifecycle domain rules.
- Public API contract tests.
- Dashboard API contract tests.
- Queue request state and constraints.

## P3 — Realtime and jobs

- SSE stream for dashboard queue.
- SSE stream for public queue.
- Job table and worker foundation.
- Outbox/event publishing if side effects become reliable requirement.

## P4 — Security and operations

- Rate limiting public endpoints.
- Audit logs.
- Backup/restore runbook tested.
- Incident/deployment runbooks.
- Basic observability dashboards/log fields.

## P5 — Product polish

- Operator guide.
- Accessibility pass.
- Mobile public form pass.
- Performance budgets for public pages.
- Privacy/retention policy.
