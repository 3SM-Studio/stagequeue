# Poza Nutą — Realtime and Queue Plan

## Decision

SSE first. HTTP mutations for actions. Polling only as fallback/prototype. WebSocket only after bidirectional needs exist.

## Target streams

```txt
GET /public/events/:eventPublicId/queue/stream
GET /dashboard/events/:eventId/queue/stream
GET /dashboard/imports/:importId/stream
```

## HTTP mutations

Examples:

```txt
POST /public/events/:eventPublicId/requests
POST /dashboard/events/:eventId/queue/requests/:requestId/approve
POST /dashboard/events/:eventId/queue/requests/:requestId/reject
POST /dashboard/events/:eventId/queue/reorder
POST /dashboard/events/:eventId/pause
POST /dashboard/events/:eventId/close
```

## SSE requirements

MUST implement:

- auth for dashboard streams;
- public visibility filtering for public streams;
- heartbeat;
- cleanup on disconnect;
- connection limit per event/client;
- safe event payloads;
- replay/refetch strategy on reconnect;
- tests for stream access and cleanup where practical.

## Event names

```txt
queue.snapshot
queue.updated
queue.request.submitted
queue.request.approved
queue.request.rejected
event.status.changed
heartbeat
```

## Scaling path

Phase 1:

```txt
single API instance + DB-backed queue state + SSE
```

Phase 2:

```txt
Redis Pub/Sub EventBus for multi-instance API fanout
```

`REDIS_URL` selects the Redis-backed EventBus. Without `REDIS_URL`, the in-memory EventBus is acceptable only for development, tests and single-instance local/runtime setups. Production and multi-instance deployments require `REDIS_URL`; otherwise API config validation fails fast.

SSE fanout is best-effort Pub/Sub. There is no replay, durable delivery or event sourcing in this phase. If Redis is unavailable, live updates/SSE fanout can be delayed or missing, but queue mutations still use the normal HTTP and database path and must not change their domain semantics because realtime delivery failed.

The same `REDIS_URL` also selects Redis-backed infrastructure rate limiting in production. Without `REDIS_URL`, development/test may use the in-memory limiter for single-process runs. Redis rate limiting is fixed-window best-effort abuse protection, not durable quota accounting. If Redis is unavailable in production, protected requests fail closed with a controlled API error instead of silently falling back to in-memory. Participant cooldown and max-active request rules remain domain limits in the queue service, separate from the IP/route rate limiter.

Phase 3:

```txt
WebSocket only if chat/presence/collaborative operator control appears
```

Do not add Kafka/Kubernetes for MVP.
