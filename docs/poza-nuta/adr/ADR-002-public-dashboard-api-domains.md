# ADR-002: Public, dashboard, and API domains

## Status

Accepted

## Context

Participants, operators, organization users, and platform owners have different security, UX, SEO, and caching needs.

## Decision

Use separate domains: `poza-nuta.pl` for public venue pages, `dashboard.poza-nuta.pl` for authenticated dashboard operations, and `api.poza-nuta.pl` for the Fastify API.

## Consequences

Positive: clearer security boundaries, simpler CORS allowlists, and better fit for public SEO versus private dashboard workflows.

Negative: cross-origin cookies, CORS, and environment management must be handled deliberately.

## Notes for implementation

Public URLs are venue based: `/:venueSlug`, `/:venueSlug/join`, and `/:venueSlug/queue`. The public frontend must not own business logic; it calls the API.
