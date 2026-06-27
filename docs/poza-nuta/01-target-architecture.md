# Poza Nutą — Target Architecture

## Summary

Poza Nutą target architecture is a venue-first karaoke operations platform.

```txt
public user -> public Next.js app -> Fastify API -> PostgreSQL
operator/admin -> dashboard Next.js app -> Fastify API -> PostgreSQL
worker -> imports/emails/jobs -> PostgreSQL/external providers
```

## Applications

```txt
apps/public-web      public venue/event pages
apps/dashboard-web   authenticated dashboard
apps/api             Fastify API, auth, permissions, SSE, jobs coordination
apps/worker          background jobs/imports/scraping/email
```

## Packages

```txt
packages/db          Drizzle schema/migrations/client
packages/domain      pure domain rules/types
packages/shared      truly shared utilities/contracts
```

## Hosting decision

- Public and dashboard Next.js apps: Vercel.
- Fastify API and worker: Railway.
- PostgreSQL: Supabase managed Postgres.
- Supabase is database provider, not initial auth/realtime authority.

## Architecture rules

MUST:

- keep public frontend thin;
- keep dashboard frontend thin;
- keep business permissions in API/domain;
- use PostgreSQL as production source of truth;
- use Fastify API for main backend;
- use workers for imports and heavy side effects;
- use SSE first for live queue updates.

MUST NOT:

- introduce a parallel Vite runtime for target UI;
- move main business logic into Next.js route handlers;
- treat JSON file storage as production storage;
- use WebSocket infrastructure before bidirectional needs exist;
- use broad `isAdmin` checks instead of resource-level permissions.
