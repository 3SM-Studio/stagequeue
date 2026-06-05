# 09 — Realtime and Background Jobs

## Choose the simplest sufficient communication model

| Need | Default |
|---|---|
| Rare updates | Polling |
| Server pushes updates to browser | SSE |
| Bidirectional low-latency communication | WebSocket |
| External system notifies backend | Webhook |
| Async work / retries | Background job |
| Multi-instance fanout | Pub/sub or DB notification |

## Polling

Use polling when:

- updates are not urgent;
- traffic is low;
- endpoint is cheap;
- simplicity matters more than freshness.

MUST NOT poll every second from many clients without load analysis.

## Long polling

Long polling is usually a fallback when SSE/WebSocket are blocked. Do not choose it by default for new browser apps.

## SSE

Use SSE when server sends updates and client sends mutations via normal HTTP.

Good for:

- live queues;
- notification streams;
- import progress;
- dashboard counters;
- read-only live logs.

MUST implement:

- authentication/authorization for private streams;
- connection cleanup;
- heartbeat if proxies close idle connections;
- reconnect handling;
- per-user/event connection limits;
- no sensitive data in public streams.

## WebSocket

Use WebSocket when real bidirectional communication is required:

- chat;
- collaborative editing;
- presence;
- multiplayer/live control;
- high-frequency client events.

MUST implement:

- `wss://` in production;
- origin checks;
- auth at connection and message level;
- message schema validation;
- rate limits;
- heartbeat/timeouts;
- max payload size;
- token/session refresh strategy;
- pub/sub for multi-instance deployments.

MUST NOT use WebSocket just because it sounds modern.

## Webhooks

Webhook handlers MUST:

- verify signatures;
- support retries;
- be idempotent;
- record provider event ID;
- return quickly;
- enqueue heavy processing.

## Background jobs

Jobs MUST be safe to retry.

Job records SHOULD include:

```txt
id
type
payload
status
attempts
last_error
run_after
created_at
updated_at
idempotency_key
```

## Domain events

Use domain events for meaningful business changes:

```txt
event.created
event.activated
queue.request.submitted
queue.request.approved
queue.changed
```

## Outbox pattern

Use outbox when a DB transaction must reliably trigger external publication:

1. write business change and outbox row in same transaction;
2. worker reads outbox;
3. worker publishes event/email/webhook/SSE fanout;
4. worker marks outbox row processed;
5. consumers are idempotent.

Without outbox, you can commit DB and lose the event, or send event and rollback DB. That is a production-grade footgun.

## Pub/sub

When more than one API instance exists, in-memory listeners are not enough.

Options:

- Postgres LISTEN/NOTIFY;
- Redis pub/sub;
- NATS;
- RabbitMQ;
- Kafka only when its operational cost is justified.

Do not start with Kafka for a small app unless the domain truly requires it.

## v3 realtime decision table

- Polling: simplest, acceptable for low-frequency/non-critical refresh.
- Long polling: fallback when SSE/WebSocket cannot be used.
- SSE: default for server-to-client live updates such as queue/status/progress.
- WebSocket: use only when bidirectional low-latency communication is required.
- Webhook: provider-to-backend event notification.
- Queue/job: durable async work, retries and side effects.
- Pub/sub: fan-out across app instances.

MUST NOT use WebSocket as a status symbol. If client mostly receives updates and sends actions over normal HTTP, SSE is usually the better default.

SSE/WebSocket implementations MUST define auth, authorization, origin checks, heartbeat, reconnect, cleanup, rate limiting and multi-instance fan-out strategy.
