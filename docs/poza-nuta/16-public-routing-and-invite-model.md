# Public Routing and Invite Model

Status: accepted product/architecture decision for the next public routing work. This document freezes the target model before implementing realtime and routing changes. It does not change the current MVP routes by itself.

## Problem

Current public-web uses venue-first MVP shortcuts:

- `/:venueSlug`
- `/:venueSlug/join`
- `/:venueSlug/queue`

They work for the demo and local QA, but they are semantically weak as the long-term public UX. A participant joins a concrete karaoke event, not an abstract venue. Manual QA also showed gaps around realtime propagation:

- public join and queue do not fully react to `publicJoinEnabled` / `publicQueueEnabled` changes in the target model;
- public venue page does not represent newly created or newly started active events as a first-class realtime surface;
- implementing more realtime on legacy shortcuts before choosing the target routes would lock in the wrong model.

The product needs a stable routing and invite decision before the next implementation tasks.

## Decyzja

The target public routing model is event-first for the participant flow and handle-first for public profiles:

1. `/` remains the product home / landing page, not a global event catalog.
2. `/@:handle` is the public profile for a venue, organizer, or brand.
3. `/event/:eventPublicId` is the main public page for a concrete event.
4. `/invite/:inviteCode` is a magic invite link issued by an operator.
5. Existing venue-first routes stay as legacy/MVP shortcuts until migrated.
6. There is no global `/events` catalog in this decision.
7. Event slugs are not the primary public event identity.

This keeps the public UX shareable, stable, and privacy-aware while preserving the current MVP flow until replacement routes exist.

## Routing Docelowy

### `/`

Product home / landing page for Poza Nuta / Stagequeue. It may explain the product and link to sign-in, dashboard, or public profiles, but it is not a global list of all live events.

### `/@:handle`

Public profile for a venue, organizer, or brand.

Expected future behavior:

- show public identity and basic public information;
- show current or upcoming public events if allowed by visibility policy;
- link to `/event/:eventPublicId` for a selected event;
- refresh active/upcoming event state after event create/start/pause/resume/close/archive/cancel.

Handles are public identity, not internal authorization boundaries. Backend visibility and permission policies remain the source of truth.

### `/event/:eventPublicId`

Main public page for a concrete event.

Expected future behavior:

- show event status and public info;
- show join form when event access policy allows it;
- show public queue when `publicQueueEnabled=true` and event status policy allows it;
- track participant-visible state through participant cookie / request ownership;
- refresh status, queue, `publicJoinEnabled`, `publicQueueEnabled`, and own request status after dashboard mutations.

### `/invite/:inviteCode`

Magic invite link issued or shared by an operator.

Expected future behavior:

1. Validate invite code.
2. If valid, grant participant access for the target event and/or set the participant cookie for that event.
3. Redirect to `/event/:eventPublicId`.
4. If invalid, expired, revoked, or already rotated, show a controlled invalid invite state.

Invite links are not the stable event URL. They are an access mechanism that can be rotated or revoked.

## Legacy / MVP Routes

The current routes remain supported until a migration task replaces them:

- `/:venueSlug`
- `/:venueSlug/join`
- `/:venueSlug/queue`

Target migration behavior:

- `/:venueSlug` should redirect to `/@:handle` once handles exist.
- `/:venueSlug/join` should redirect to the active event page or show a controlled selection / no-active-event state.
- `/:venueSlug/queue` should redirect to the event page with queue section or show a controlled selection / no-active-event state.

These routes are legacy/MVP venue-first shortcuts. They must not regress while they exist, but they are not the long-term center of realtime work.

Current event-slug placeholders under `/:venueSlug/events/:eventSlug` remain placeholders. They are not promoted to the target model by this decision.

## Identyfikatory

### `id` / internal UUID

Internal DB/API identity. It remains useful for dashboard APIs, joins, foreign keys, staff assignment, audit logs, and internal support workflows. It is not the desired public UX URL.

### `eventPublicId`

Short, random, stable public event identifier, for example:

```txt
/event/ka2Md-d1das
```

Properties:

- stable for the event lifetime;
- safe to share publicly when public event visibility allows it;
- not guessable as a sequential ID;
- separate from invite codes;
- preferred public event URL identity.

### `inviteCode`

Rotatable/revocable access token for an invite link:

```txt
/invite/n7hL2-vQp9
```

Properties:

- grants or restores participant access for one event according to invite policy;
- can expire, be revoked, or be rotated;
- must not be the same value as `eventPublicId`;
- must not be stored or logged as a participant secret in plaintext beyond the minimum operational need.

### `handleDisplay`

Case-preserving public handle shown in UI, for example:

```txt
@iGranieWLochu
```

### `handleNormalized`

Case-insensitive canonical handle used for uniqueness and lookup, for example:

```txt
igraniewlochu
```

`@igraniewlochu`, `@iGranieWLochu`, and `@IGRANIEWLOCHU` reserve the same handle. The product may display the original casing, but uniqueness is case-insensitive.

## Invite / Access Model

Direct `/event/:eventPublicId` access and invite access are separate:

- direct event URL can show public event information and queue according to public visibility policy;
- invite link can grant participant access for the event;
- invite code can be revoked or rotated without changing the event URL;
- participant identity still uses anonymous participant cookie, not accounts;
- participant access must never be passed through query string tokens after the invite has been claimed.

Rules:

- `publicJoinEnabled=false` blocks the join form even for invited or already joined participants.
- `publicQueueEnabled=false` blocks public queue visibility according to existing public queue policy.
- Event status still matters:
  - active can accept public submit when join is enabled and access policy allows it;
  - paused blocks submit but may keep queue visible;
  - closed/archived/cancelled follow public visibility policy and must not leak private state.
- Backend remains the source of truth for event, venue, organization, invite, and participant access checks.

## Realtime Implications

Target realtime work should focus on these future surfaces:

- `/@:handle` refreshes public event list / active event after event create, start, pause, resume, close, archive, and cancel.
- `/event/:eventPublicId` refreshes:
  - event status;
  - queue snapshot;
  - `publicJoinEnabled`;
  - `publicQueueEnabled`;
  - participant-visible request state;
  - invite/access state when relevant.
- Legacy venue-first shortcuts continue to work until migration, but should not receive large new realtime architecture beyond regression protection.

Realtime implementation should preserve the current safety lessons:

- prefer one bounded stream or safe refresh strategy per page;
- avoid EventSource-per-event patterns on list pages;
- keep operator mutations and public submit stable even if realtime reconnects;
- keep manual refresh or safe polling as fallback where it improves live-event resilience.

## Security Considerations

- Public users must not infer private event, hidden venue, or hidden organization existence.
- Visibility policy must continue to check venue status, venue verification, organization status, event status, and public flags.
- `eventPublicId` must be random enough to avoid enumeration as a practical discovery mechanism.
- `inviteCode` must be separate from `eventPublicId` so it can be revoked or rotated.
- Invite validation must not leak whether a hidden/private event exists.
- Participant cookies and token hashes must remain private; invite handling must not expose participant tokens in response bodies, URLs, logs, or public HTML.
- Handles are public identity only; they must not grant dashboard or operator permission.
- Handle lookup must be case-insensitive and protected against reserved/static path collisions.
- Legacy `/:venueSlug` paths must keep reserved slug guards for `sw.js`, `_next`, assets, manifest, robots, sitemap, and similar static paths.

## Implementation Plan W Małych Taskach

1. Data model decision for handles:
   - define owner type: venue, organization, or brand;
   - add `handleDisplay` and `handleNormalized`;
   - add case-insensitive uniqueness and reserved handle rules.
2. Add public profile route:
   - API lookup for `/@:handle`;
   - public-web route `/@:handle`;
   - no global event catalog.
3. Add event public ID contract:
   - ensure `eventPublicId` is short, random, stable, and exposed in public DTOs;
   - keep internal UUID for dashboard and DB.
4. Add `/event/:eventPublicId`:
   - event detail;
   - queue section;
   - join form state;
   - participant my-request tracking;
   - realtime/safe refresh for status and flags.
5. Add invite model:
   - invite generation/rotation/revocation backend contract;
   - `/invite/:inviteCode` claim endpoint/page;
   - redirect to `/event/:eventPublicId`.
6. Migrate legacy venue-first routes:
   - redirect `/:venueSlug` to `/@:handle`;
   - redirect or controlled-select `/:venueSlug/join`;
   - redirect or controlled-select `/:venueSlug/queue`;
   - preserve backwards compatibility during rollout.
7. Update QA playbook and release evidence templates for event-first public URLs.
8. Only after the route migration, revisit realtime coverage for the new event-first pages.

## Non-goals

- No code implementation in this task.
- No new routes are added by this document.
- No global `/events` directory.
- No promotion of event slugs as primary public event URLs.
- No participant accounts.
- No dashboard CRUD changes.
- No WebSocket, Redis, BullMQ, or new realtime infrastructure decision.
- No change to existing public API behavior until a follow-up implementation task explicitly does it.
