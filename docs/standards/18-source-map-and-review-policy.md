# 18 — Source Map and Review Policy

This standard should be reviewed when framework/security/platform behavior changes.

## Primary source categories

- React official docs: Server Components, Client Components, hooks, state.
- Next.js official docs: App Router, caching, Server Actions/Functions, deployment behavior.
- Fastify official docs: plugins, schemas, validation, serialization.
- TypeScript official docs: strictness and compiler options.
- Python Packaging/FastAPI/Django official docs where Python backend is used.
- OWASP: ASVS, Top 10, cheat sheets for password storage, sessions, file upload, logging, CSRF, XSS and WebSocket security.
- NIST SP 800-63B: digital identity and password guidance.
- PostgreSQL official docs: transactions, isolation, indexes, constraints, backups, EXPLAIN.
- OpenTelemetry docs: traces, metrics, logs.
- Google SRE: release engineering, incident management and postmortems.
- GitHub Docs: Actions, branch protection, CODEOWNERS, security scanning.
- W3C/WCAG: accessibility and time/timezone guidance.
- Conventional Commits and SemVer.
- Twelve-Factor App for config/environment principles.

## Review cadence

- Security guidance: quarterly or after relevant incident/CVE.
- Framework behavior: before major upgrades.
- CI/deployment standards: after every deployment incident.
- Database/migration standards: after every risky migration.
- Poza Nutą supplement: after every architecture-affecting PR.

## Source freshness rule

If a recommendation depends on current framework behavior, link to official documentation in the PR/ADR. Do not rely on memory for changing behavior such as Next.js caching, auth library APIs, browser platform constraints or security recommendations.
