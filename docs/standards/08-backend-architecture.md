# 08 — Backend Architecture

## Backend goals

Backend owns:

- validation;
- authorization;
- use-cases;
- transactions;
- persistence;
- audit;
- integrations;
- background jobs;
- realtime event publishing.

Frontend may improve UX, but backend protects the system.

## Recommended module structure

```txt
modules/
  events/
    api/
    domain/
    service/
    db/
    tests/
  venues/
  queue/
shared/
  auth/
  config/
  errors/
  logger/
  validation/
```

## Route/controller

Routes should:

- parse request;
- rely on schema validation;
- authenticate;
- call service;
- map known errors;
- return DTO.

Routes should not contain SQL or complex business rules.

## Service/use-case

Services should:

- enforce domain rules;
- call policies;
- coordinate repositories;
- start transactions when needed;
- emit domain/integration events;
- return domain result or DTO-ready result.

## Domain

Domain code should be framework-independent.

MUST NOT import Fastify, Next.js, Express, database client, HTTP response or browser APIs in pure domain modules.

## Repository

Repositories should:

- encapsulate persistence details;
- expose intentional methods;
- not return public HTTP DTOs unless explicitly designed as a read model;
- not decide authorization.

## Errors

Use typed/domain errors:

```txt
EventNotFoundError
EventSlugConflictError
PublicQueueDisabledError
ForbiddenError
ValidationError
```

Map them at API boundary.

## Fastify guidance

Fastify is appropriate for a long-running TypeScript API requiring:

- route schemas;
- validation/serialization;
- plugins;
- SSE/WebSocket support;
- background integration coordination;
- structured logging.

Use JSON Schema or a validated schema layer at route boundaries.

## Python backend guidance

Use Python when it gives leverage:

- scraping/crawling;
- data pipelines;
- ML/AI tasks;
- automation workers;
- integration-heavy jobs;
- FastAPI services where Python ecosystem matters.

FastAPI suits API-first Python services. Django suits CRUD-heavy systems needing admin and batteries-included backend.

## Workers

Workers are for:

- email;
- imports;
- scraping;
- webhook processing;
- heavy reports;
- cleanup;
- sync jobs.

MUST make jobs idempotent. Retries are normal.

## External integrations

Wrap each provider behind an adapter:

```txt
providers/apify/
providers/email/
providers/catalogSource/
providers/payment/
```

Do not scatter provider-specific calls across services.

## Configuration

Validate environment variables at startup. Fail fast if required config is missing or malformed.

MUST keep `.env.example` updated.

## v3 backend gate

A backend use-case SHOULD have this shape when non-trivial:

```txt
schema -> route/controller -> policy -> service/use-case -> repository/adapter -> mapper -> tests
```

MUST keep domain rules out of HTTP handlers when rules are reused or risky.
MUST keep provider/infrastructure details behind adapters.
MUST NOT return raw provider errors to clients.
