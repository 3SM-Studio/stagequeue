# ADR-012: Docker policy

## Status

Accepted

## Context

Local development needs reproducible infrastructure, and Railway deployments benefit from predictable API/worker runtime images.

## Decision

Use Docker Compose for local infrastructure, starting with PostgreSQL. Add Dockerfiles for API and worker when those runtime apps are ready. Do not prioritize Docker for Next.js frontends.

## Consequences

Positive: local Postgres is easy to start, backend runtimes are reproducible, and future deployment options remain open.

Negative: Docker adds operational files that must stay aligned with app scripts and environment examples.

## Notes for implementation

Do not add Redis or Kubernetes. Do not run production Postgres in Docker. Production database is managed Supabase Postgres.
