# ADR-004: Fastify API

## Status

Accepted

## Context

The prototype API uses `node:http`. The product needs auth, permissions, SSE, jobs, schema validation, and long-running backend behavior.

## Decision

Use Fastify for `apps/api`. Deploy it as a long-running Node.js process on Railway.

## Consequences

Positive: the API has a clear home for auth, permissions, organizations, venues, events, queue operations, catalog imports, SSE, jobs, and audit logs.

Negative: the current `node:http` API must be replaced, not endlessly patched into the final backend.

## Notes for implementation

The existing `apps/api/src/server.ts` can remain as legacy reference until the Fastify skeleton is introduced. Do not move main business logic into Next.js route handlers.
