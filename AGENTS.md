# AGENTS.md

This file tells Codex and other coding agents how to work in this repository.
It is intentionally short and directive. The detailed rules live in `docs/`.

## 0. Prime directive

Do not optimize for producing code quickly. Optimize for producing a small, reviewable, safe change that respects this repository's engineering standards.

If a requested change conflicts with the standards, do not silently bypass the standards. State the conflict, choose the safest compliant path, and update the relevant ADR/checklist only when the task explicitly includes that decision.

## 1. Instruction hierarchy

When working in this repo, follow instructions in this order:

1. User task and explicit maintainer instructions.
2. This `AGENTS.md`.
3. Project-specific decisions in `docs/poza-nuta/` and `docs/poza-nuta/adr/`.
4. General engineering standards in `docs/standards/`.
5. Checklists in `docs/checklists/`.
6. Templates in `docs/templates/`.
7. Existing code conventions in the touched area.

If two documents conflict:

- More local/project-specific guidance wins over general guidance.
- Accepted ADRs win over general recommendations.
- Security/privacy rules win over convenience.
- Existing public API contracts must not be broken without an explicit ADR and migration plan.

## 2. Mandatory reading before changes

Before editing code, read the smallest relevant set of docs.

Always read:

- `docs/standards/00-index.md`
- `docs/standards/01-senior-engineering-mindset.md`
- `docs/standards/15-definition-of-done-review-checklists.md`

For Poza Nutą work, also read:

- `docs/poza-nuta/00-supplement-index.md`
- `docs/poza-nuta/01-target-architecture.md`
- `docs/poza-nuta/02-accepted-decisions.md`
- `docs/poza-nuta/03-permission-model.md`
- Any relevant ADR in `docs/poza-nuta/adr/`

Then read task-specific standards:

| Task type | Read these docs |
|---|---|
| API endpoint | `docs/standards/04-api-design.md`, `docs/checklists/api-endpoint-checklist.md`, `docs/templates/api-endpoint-spec-template.md` |
| Backend use-case | `docs/standards/08-backend-architecture.md`, `docs/checklists/backend-endpoint-checklist.md` |
| Database/migration | `docs/standards/05-database-data-modeling.md`, `docs/checklists/database-migration-checklist.md`, `docs/templates/database-migration-plan-template.md` |
| Auth/security/privacy | `docs/standards/06-security-auth-privacy.md`, `docs/checklists/security-review-checklist.md` |
| Frontend feature | `docs/standards/07-frontend-architecture.md`, `docs/standards/17-accessibility-i18n-ux.md`, `docs/checklists/frontend-feature-checklist.md` |
| Realtime/SSE/WebSocket/jobs | `docs/standards/09-realtime-background-jobs.md`, `docs/checklists/realtime-change-checklist.md` |
| Tests | `docs/standards/10-testing-quality.md` |
| Release/deploy | `docs/standards/11-ci-cd-release-deployment.md`, `docs/checklists/release-checklist.md`, `docs/templates/release-plan-template.md` |
| Observability/incidents/backups | `docs/standards/12-observability-incidents-backups.md`, `docs/runbooks/` |
| Dependency addition | `docs/standards/13-dependencies-licenses-ai.md`, `docs/checklists/dependency-addition-checklist.md`, `docs/templates/dependency-decision-template.md` |
| Documentation change | `docs/standards/14-documentation-onboarding.md`, `docs/checklists/documentation-review-checklist.md` |

Do not read the entire docs tree for every small task. Use the relevant minimum set. Bloated context makes agents worse.

## 3. Work style

### Required behavior

- Start by identifying the smallest safe change.
- Prefer modifying existing code over adding new abstractions.
- Keep PR-sized changes focused: one feature/fix/refactor per change.
- Preserve existing public contracts unless the task explicitly requires a breaking change.
- Add or update tests for domain logic, authorization, public API shape, migrations, and bug fixes.
- Update docs/ADR/checklists when the change introduces a durable decision.
- Leave code better named, easier to test, and safer than before.

### Forbidden behavior

- Do not create `utils.ts`, `helpers.ts`, `stuff.ts`, `new.ts`, or similar dumping grounds.
- Do not bypass backend validation because frontend validation exists.
- Do not implement authorization only in the UI.
- Do not trust client input.
- Do not leak raw database records to public DTOs.
- Do not add runtime dependencies without justification.
- Do not introduce WebSocket when SSE or polling is sufficient.
- Do not write custom crypto, password hashing, auth, or token schemes.
- Do not commit secrets, `.env`, database dumps, generated caches, `node_modules`, `.next`, or build artifacts.
- Do not leave commented-out code, debug logs, or unexplained TODOs.

## 4. Architecture boundaries

Respect these boundaries unless an ADR changes them:

```txt
UI -> API client -> backend route/controller -> service/use-case -> domain/repository -> database/external services
```

Rules:

- UI collects intent and renders state. It does not enforce business security.
- API routes/controllers validate, authenticate, authorize, call services, and map errors.
- Services/use-cases coordinate domain rules, repositories, and side effects.
- Domain modules contain business rules and must not import framework request/response objects.
- Repositories talk to storage. They must not produce HTTP responses.
- DTOs are explicit. Do not expose DB shape by accident.

## 5. Poza Nutą default decisions

For Poza Nutą work, default to the accepted project decisions unless a new ADR says otherwise:

- Venue-first domain model.
- Separate public, dashboard, and API domains.
- Next.js for public/dashboard frontend surfaces.
- Fastify for API/backend where applicable.
- PostgreSQL + Drizzle for primary persistence.
- Better Auth + Google OAuth for auth direction.
- SSE-first for live queue updates; WebSocket only when bidirectional realtime is required.
- Apify/Crawlee only for scraping/automation workers, not the main backend.
- Organization-to-venue access control with resource-level authorization.
- Event staff assignments are explicit domain concepts.
- Vercel/Railway/Supabase hosting direction unless superseded by ADR.

Read `docs/poza-nuta/02-accepted-decisions.md` before changing architecture.

## 6. Naming and file placement

Use names that describe domain intent.

Good examples:

```txt
createEvent.service.ts
createEvent.schema.ts
eventRepository.ts
eventPolicy.ts
mapEventToPublicDto.ts
public-events.contract.test.ts
```

Bad examples:

```txt
utils.ts
helpers.ts
data.ts
logic.ts
newService.ts
index2.ts
```

React components use `PascalCase`. Hooks start with `use`. Python files use `snake_case`. Tests sit close to the code or in the relevant test folder, following the existing convention.

## 7. Comments

Prefer clear names over comments.

Write comments only for:

- business exceptions,
- security decisions,
- cache rules,
- concurrency/race-condition reasoning,
- integration workarounds,
- public API compatibility decisions,
- places future agents may incorrectly “simplify”.

Never comment obvious code. Remove commented-out code. `TODO`, `FIXME`, and `HACK` require an issue ID or a concrete revisit condition.

## 8. Security baseline

Every change must respect the security baseline:

- Validate all external input on the backend.
- Authorize every resource-level action.
- Protect organization/venue/event scope in queries and services.
- Hash passwords only with approved password hashing algorithms; never SHA/MD5 for passwords.
- Store secrets outside git.
- Use safe error messages and stable error codes.
- Rate-limit public mutation endpoints and auth-sensitive endpoints.
- Verify webhook signatures.
- For SSE/WebSocket: authenticate, check origin where applicable, enforce limits, heartbeat/cleanup subscriptions.
- Avoid logging secrets, tokens, passwords, or unnecessary personal data.

If touching security-sensitive code, run through `docs/checklists/security-review-checklist.md`.

## 9. Testing expectations

Add the smallest meaningful tests that protect behavior:

- Domain rule changed -> unit/domain test.
- Endpoint changed -> integration/API test.
- Public API shape changed or relied upon -> contract test.
- Authorization changed -> positive and negative authorization tests.
- Migration changed -> migration/DB integrity check where possible.
- Bug fixed -> regression test unless explicitly impractical.
- Frontend form changed -> validation/error/accessibility-relevant test when practical.

Do not chase coverage decoration. Tests must catch real regressions.

## 10. Commands

This package is a documentation starter kit. In a real repository, replace this section with exact commands.

Expected command categories:

```bash
# install dependencies
<package-manager> install

# static checks
<package-manager> lint
<package-manager> typecheck

# tests
<package-manager> test
<package-manager> test:integration
<package-manager> test:e2e

# build
<package-manager> build
```

When this file is copied into a concrete repo, maintainers must replace placeholders with real commands. Codex must run relevant checks after changes when the environment allows it. If checks cannot be run, report exactly what was not run and why.

## 11. Dependency policy

Before adding a runtime dependency:

1. Check whether the platform/framework already solves the problem.
2. Check whether a small local function would be safer.
3. Check maintenance, license, security posture, and transitive dependency cost.
4. Add justification using `docs/templates/dependency-decision-template.md` when the dependency is non-trivial.

Never add a dependency for a tiny helper without a strong reason.

## 12. Database and migration policy

Before changing persistence:

- Define the data invariant.
- Prefer database constraints for integrity under concurrency.
- Plan migration order and rollback.
- Avoid destructive migration without expand/contract strategy.
- Add indexes for real query paths, not decorative guesses.
- Consider backfill and production data volume.

Use `docs/checklists/database-migration-checklist.md` and `docs/templates/database-migration-plan-template.md`.

## 13. Realtime policy

Default decision order:

1. No realtime if refresh/manual interaction is enough.
2. Polling for low-frequency, low-risk updates.
3. SSE for server-to-client live updates.
4. WebSocket only for bidirectional, low-latency interaction.
5. Pub/sub or database notifications when multiple backend instances must broadcast state.

For Poza Nutą live queues, SSE is the default before WebSocket.

## 14. Documentation and ADR policy

Update documentation when a change introduces or changes:

- architecture boundaries,
- public API contracts,
- authorization rules,
- persistence model,
- realtime strategy,
- operational procedures,
- dependency policy,
- security/privacy posture.

Use ADRs for durable decisions. Do not bury architectural decisions only in code comments or PR descriptions.

## 15. Final response/reporting expectations

After completing a task, summarize:

- What changed.
- Which standards/checklists were relevant.
- What tests/checks were run.
- What was not run and why.
- Any risks, follow-ups, or ADR/doc updates needed.

Be honest. Do not claim checks passed if they were not run.


## Legacy Poza Nutą docs

If a task touches documentation migration or old project docs, read:

- `docs/poza-nuta/12-legacy-docs-migration-map.md`
- `docs/AGENTS.md`

Never delete old ADRs, integration notes, audits, or checklists without preserving history or explaining why the content is obsolete.
