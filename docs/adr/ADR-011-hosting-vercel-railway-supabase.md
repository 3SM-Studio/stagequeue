# ADR-011: Hosting on Vercel, Railway, and Supabase

## Status

Accepted

## Context

The product has separate runtime needs for Next.js frontends, a long-running API, a worker, and managed PostgreSQL.

## Decision

Deploy public and dashboard Next.js apps to Vercel, the Fastify API and worker to Railway, and PostgreSQL to Supabase.

## Consequences

Positive: each runtime uses a hosting target that fits its operational profile, while Postgres backups and operations are managed.

Negative: deployment and environment configuration span multiple providers and must be documented.

## Notes for implementation

Do not use Vercel Functions as the main API runtime. Use Supabase as managed PostgreSQL only, not as Auth or Realtime at the initial stage.
