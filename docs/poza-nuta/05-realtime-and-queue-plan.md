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
Postgres LISTEN/NOTIFY or Redis pub/sub if multiple API instances need fanout
```

Phase 3:

```txt
WebSocket only if chat/presence/collaborative operator control appears
```

Do not add Kafka/Kubernetes for MVP.
