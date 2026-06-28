# ADR-002: Public, dashboard, and API domains

## Status

Accepted for domain separation. The venue-based public URL note is superseded by
`docs/poza-nuta/16-public-routing-and-invite-model.md`.

## Context

Participants, operators, organization users, and platform owners have different security, UX, SEO, and caching needs.

## Decision

Use separate domains: `poza-nuta.pl` for public venue pages, `dashboard.poza-nuta.pl` for authenticated dashboard operations, and `api.poza-nuta.pl` for the Fastify API.

## Consequences

Positive: clearer security boundaries, simpler CORS allowlists, and better fit for public SEO versus private dashboard workflows.

Negative: cross-origin cookies, CORS, and environment management must be handled deliberately.

## Notes for implementation

The original venue-based participant URLs (`/:venueSlug`, `/:venueSlug/join`, and
`/:venueSlug/queue`) are superseded. The current participant routes are:

- `/event/:eventPublicId` for the public event landing;
- `/event/:eventPublicId/session` for the participant session app;
- `/invite/:inviteCode` for access claim followed by redirect to the participant session.

Standalone `/event/:eventPublicId/queue` and venue-scoped join/queue routes return the
controlled public 404 path. `/:venueSlug` remains only as a temporary read-only compatibility
page that links to canonical event landings. The public frontend must not own business logic;
it calls the API.
