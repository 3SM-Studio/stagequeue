# ADR-004: Fastify API

## Status

Accepted

## Context

The prototype API uses `node:http`. The product needs auth, permissions, SSE, jobs, schema validation, and long-running backend behavior.

## Decision

Use Fastify for `apps/api`. Deploy it as a long-running Node.js process on Railway.

## Consequences

Positive: the API has a clear home for auth, permissions, organizations, venues, events, queue operations, catalog imports, SSE, jobs, and audit logs.

Negative: the prototype `node:http` API required retirement after Fastify reached equivalent production coverage.

## Notes for implementation

The former `apps/api/src/server.ts` prototype has been removed. `apps/api/src/index.ts` is the only API runtime
entrypoint. Do not move main business logic into Next.js route handlers.
