# ADR-010: Event staff assignments

## Status

Accepted

## Context

Organizations can operate many events, and different users may host or operate each event. Historical accountability matters.

## Decision

Assign specific users to events through `event_staff_assignments`, with roles such as lead host, host, queue operator, and viewer.

## Consequences

Positive: event-level responsibility is explicit, historical events can show who hosted them, and operator access can be scoped.

Negative: event mutations require checks across session, organization membership, venue access, event status, and staff assignment.

## Notes for implementation

Queue operations must verify event operation permission. Do not rely on a broad `isAdmin` flag.
