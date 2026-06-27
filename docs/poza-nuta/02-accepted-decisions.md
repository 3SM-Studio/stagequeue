# Poza Nutą — Accepted Decisions Summary

This file summarizes accepted project decisions discovered in existing ADRs.

## ADR-001 — Venue-first domain model

Poza Nutą is venue-first: `venue -> event -> queue`. Organizations, organization memberships, venue access and event staff assignments surround that core.

## ADR-002 — Public, dashboard and API domains

Use separate domains:

```txt
poza-nuta.pl
 dashboard.poza-nuta.pl
api.poza-nuta.pl
```

Public URLs are venue based.

## ADR-003 — Next.js for public and dashboard apps

Use Next.js for `apps/public-web` and `apps/dashboard-web`. The former Vite prototype has been retired.

## ADR-004 — Fastify API

Use Fastify for `apps/api`. The prototype `node:http` API has been retired.

## ADR-005 — PostgreSQL and Drizzle

Use PostgreSQL and Drizzle. JSON storage is prototype-only. Required active queue constraint: one active or paused event per venue.

## ADR-006 — Better Auth with Google OAuth

Use Better Auth inside Fastify API. Start with Google OAuth and httpOnly secure cookies. Participants do not need accounts.

## ADR-007 — SSE first

Use Server-Sent Events as the only live browser transport for queue/operator/import updates. Initial snapshots,
EventSource open/reconnect/domain-event refetches, manual refresh, successful-mutation refresh, and one-shot
focus/visibility refresh are allowed. Cyclic polling is not. WebSocket remains deferred until bidirectional needs
appear.

## ADR-008 — Global song catalog

Catalog is platform-owned and global. Sources include iSing and KaraFun. Do not create per-venue catalogs for MVP.

## ADR-009 — Organization-to-venue access

Venue access is granted to organizations through `venue_organization_access`. Users operate through organization membership and permissions.

## ADR-010 — Event staff assignments

Specific users can be assigned to events with roles such as lead host, host, queue operator, viewer.

## ADR-011 — Hosting on Vercel/Railway/Supabase

Next.js apps on Vercel, Fastify API/worker on Railway, PostgreSQL on Supabase.

## ADR-012 — Docker policy

Use Docker Compose for local infrastructure. Add Dockerfiles for API/worker when ready. Do not prioritize Docker for Next.js frontends. Do not add Redis/Kubernetes yet.
