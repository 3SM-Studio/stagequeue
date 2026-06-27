# Poza Nutą — Realtime and Queue Plan

## Decision

SSE is the only live browser transport. HTTP mutations remain the action path. Interval/timeout-loop polling and
cyclic snapshot fetching are not fallback transports. WebSocket remains deferred until bidirectional needs exist.

## Target streams

```txt
GET /public/events/:eventPublicId/stream
GET /dashboard/events/:eventId/stream
GET /platform/catalog/import-runs/:runId/stream
```

The legacy `GET /public/venues/:venueSlug/stream` remains available for compatibility, but canonical public-web
uses only the event-scoped public stream.

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
queue.updated
request.created
request.approved
request.rejected
request.started
request.done
request.skipped
request.moved
event.started
event.paused
event.resumed
event.closed
event.archived
event.cancelled
```

Public domain-update frames expose only `{ type, at }`; the initial `connected` frame contains only public scope
context. Internal event, venue, request and organization identifiers stay inside the EventBus and protected
dashboard stream. Dashboard event streams retain their authenticated internal payload because the operator client
is authorized for the concrete event.

The public queue and dashboard operator clients refetch their event-scoped snapshots after every relevant frame
and after every EventSource `open`, including reconnect. A domain event received after an error restores the live
connection state. Focus and visibility may trigger one one-shot refresh, and manual refresh remains available.
There is no interval polling fallback. The dashboard events list has no per-event stream; it uses only its initial
snapshot plus manual and one-shot focus/visibility refresh.

The server sends a `: ping` heartbeat comment every 20 seconds and unsubscribes from the EventBus when the HTTP
connection closes. SSE remains best-effort and has no replay; reconnect refetch is the recovery mechanism.

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
