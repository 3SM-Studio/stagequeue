# ADR-001: Venue-first domain model

## Status

Accepted

## Context

The current prototype is centered around a flat event identifier. That is not enough for a platform where public identity, access, history, and operations are tied to real venues.

## Decision

Poza Nuta is a venue-first platform. The core model is `venue -> event -> queue`, with organizations, organization memberships, organization-to-venue access, and event staff assignments around it.

## Consequences

Positive: public URLs are stable, venue history survives organization or staff changes, and access can be granted to organizations instead of individuals.

Negative: the model is more complex than a single queue app and requires explicit venue, organization, event, and permission layers.

## Notes for implementation

Do not continue the flat `eventId` model as the target architecture. Existing queue concepts can be reused, but queue state must eventually be attached to an event that belongs to a venue.
