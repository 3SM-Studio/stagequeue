# ADR-007: SSE first

## Status

Accepted

## Context

Queues, operator panels, and import progress need live updates. The first product milestone does not require full bidirectional realtime.

## Decision

Use Server-Sent Events as the only live browser transport for queue, session, and operator state. Do not use
interval polling, timeout loops, `refetchInterval`, or cyclic snapshot fetching as a fallback.

Clients fetch an initial snapshot and may refetch once after EventSource open/reconnect, a relevant SSE domain
event, manual refresh, a successful mutation, or a focus/visibility transition. EventSource errors use the
browser's native reconnect behavior and do not start polling.

## Consequences

Positive: SSE is simpler than WebSockets, works well with Fastify long-running processes, and fits queue/update streams.

Negative: bidirectional interactions still happen through normal HTTP mutations, connection management must be
handled carefully, and a disconnected SSE client can remain stale until reconnect or an explicit one-shot
refresh.

## Notes for implementation

Target streams include public event queue, dashboard operator queue, and catalog import progress. List pages
without a bounded stream use initial/manual/focus refresh only; they do not poll. Do not introduce WebSocket
infrastructure on day one.
