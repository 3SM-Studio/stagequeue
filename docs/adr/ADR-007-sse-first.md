# ADR-007: SSE first

## Status

Accepted

## Context

Queues, operator panels, and import progress need live updates. The first product milestone does not require full bidirectional realtime.

## Decision

Use Server-Sent Events first. Keep polling only as a fallback or temporary prototype behavior.

## Consequences

Positive: SSE is simpler than WebSockets, works well with Fastify long-running processes, and fits queue/update streams.

Negative: bidirectional interactions still happen through normal HTTP mutations, and connection management must be handled carefully.

## Notes for implementation

Target streams include public event queue, dashboard operator queue, and catalog import progress. Do not introduce WebSocket infrastructure on day one.
