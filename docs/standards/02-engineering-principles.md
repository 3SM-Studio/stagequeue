# 02 — Engineering Principles

## P1. Prefer explicit contracts

MUST define contracts at system boundaries:

- API request/response DTOs;
- validation schemas;
- error codes;
- database constraints;
- environment variables;
- event payloads;
- public module exports.

Implicit contracts are bugs waiting for a release.

## P2. Separate layers

Default flow:

```txt
UI -> API client -> route/controller -> service/use-case -> domain policy -> repository/adapter -> database/external system
```

MUST NOT put database queries in React components. MUST NOT return HTTP responses from repositories. MUST NOT import framework request objects into domain rules.

## P3. Validate at the boundary

Frontend validation is UX. Backend validation is security and integrity.

MUST validate all untrusted input:

- HTTP body/query/path;
- cookies/session values;
- webhooks;
- external API responses if trusted assumptions matter;
- job payloads;
- file uploads;
- realtime messages.

## P4. Authorize the resource, not only the user

Authentication says who someone is. Authorization says what they can do to a specific resource.

MUST check organization/tenant/venue/event ownership or permission for every protected operation.

## P5. Use the database to defend integrity

Application checks are not enough under concurrency.

Use:

- primary keys;
- foreign keys;
- unique constraints;
- check constraints;
- not-null constraints;
- transactions;
- indexes.

## P6. Small PRs beat heroic PRs

A PR should be reviewable in one sitting. Large PRs hide bugs and force rubber-stamp reviews.

Split by:

- migration;
- backend contract;
- frontend use;
- tests;
- refactor;
- documentation.

## P7. Boring code is a feature

Prefer boring, readable code over clever abstractions. Clever code is only acceptable when it substantially reduces real complexity and is well tested.

## P8. Every exception must be visible

Exceptions to standards require one of:

- ADR;
- PR note;
- code comment explaining why;
- runbook entry;
- ticketed technical debt.

Unwritten exceptions are rot.

## P9. Production matters

MUST design for:

- deployment;
- rollback;
- observability;
- backup/restore;
- incident response;
- safe failure modes.

## P10. Documentation is part of delivery

If a change modifies behavior, architecture, operations, environment variables, permissions, API contracts or data retention, documentation must be updated.
