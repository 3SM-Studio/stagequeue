# ADR-005: PostgreSQL and Drizzle

## Status

Accepted

## Context

JSON files are acceptable for a local prototype, but the platform needs multi-tenant data, permissions, active event constraints, queue history, catalog imports, jobs, and transactions.

## Decision

Use PostgreSQL as the database and Drizzle for schema and migrations. Use Supabase as managed PostgreSQL.

## Consequences

Positive: strong relational constraints, partial indexes, transactions, JSONB where needed, and a migration path for a real operations platform.

Negative: development requires local Postgres and deliberate migration workflows.

## Notes for implementation

Do not treat JSON queue storage as production storage. The required active queue constraint is one active or paused event per venue.
