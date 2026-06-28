# Public Routing and Invite Model

Status: accepted and implemented for the event landing/session participant flow. The future
`/@:handle` profile model remains unimplemented. Legacy venue-scoped join/queue routes and the
standalone event queue route return 404.

## Problem

Earlier public-web versions used venue-first MVP shortcuts:

- `/:venueSlug`
- `/:venueSlug/join`
- `/:venueSlug/queue`

They were semantically weak because a participant joins a concrete karaoke event, not an abstract venue. They also allowed a venue lookup to select an event implicitly, which is unsafe once visibility and access policy are event-scoped. Keeping them would lock further public UX and realtime work into the wrong model.

## Decyzja

The target public routing model is event-first for the participant flow and handle-first for public profiles:

1. `/` is a bounded public discovery homepage for current events, upcoming events, and visible venues.
2. `/@:handle` is the public profile for a venue, organizer, or brand.
3. `/event/:eventPublicId` is the informational landing page for a concrete event.
4. `/event/:eventPublicId/session` is the participant app for submit, own requests, and the public queue.
5. `/invite/:inviteCode` is a magic invite link issued by an operator and redirects to the participant session.
6. `/:venueSlug` may remain temporarily as a read-only legacy venue page, but it links only to canonical event pages.
7. Venue-scoped join, queue, and event-slug routes return 404 and do not redirect.
8. There is no separate global `/events` route in this decision.
9. Event slugs are not the primary public event identity.

This keeps the public UX shareable, stable, and privacy-aware while preventing venue lookup from silently choosing a participant's event.

## Routing Docelowy

### `/`

Simple public discovery homepage for Poza Nuta / Stagequeue.

Rules:

- show bounded sections for current public events, upcoming public events, and public venues;
- include only events with `visibility=public`; never discover `unlisted` or `private` events;
- keep `invite_required` events discoverable while clearly stating that joining requires the QR available at the venue;
- use `/event/:eventPublicId` as the canonical destination for event details;
- do not add public login, search, geolocation, or homepage realtime as part of this decision.

### `/@:handle`

Public profile for a venue, organizer, or brand.

Expected future behavior:

- show public identity and basic public information;
- show current or upcoming public events if allowed by visibility policy;
- link to `/event/:eventPublicId` for a selected event;
- refresh active/upcoming event state after event create/start/pause/resume/close/archive/cancel.

Handles are public identity, not internal authorization boundaries. Backend visibility and permission policies remain the source of truth.

### `/event/:eventPublicId`

Informational public landing for a concrete event.

Rules:

- show event status and public info;
- show the venue, organizer, start time, and join availability;
- link to `/event/:eventPublicId/session`;
- do not render the join form, song fields, participant requests, or the live queue;
- keep `invite_required` events visible when event visibility allows it, while explaining that joining requires the venue QR.

### `/event/:eventPublicId/session`

Participant app for a concrete event.

Rules:

- resolve the event only through `eventPublicId`, never through a venue slug;
- use the existing participant cookie and `participant_event_access`;
- show the join form only when backend submit policy allows it;
- for `invite_required` without access, show `Zeskanuj QR w lokalu, aby dołączyć do sesji.` without song fields;
- when public join is disabled or the event cannot accept submissions, show `Zgłoszenia są zamknięte`;
- include own-request state and the public queue according to existing API policy;
- use one event-scoped SSE connection for live queue and participant-state refresh;
- use initial, reconnect, domain-event, manual, and mutation-success snapshot refreshes without cyclic polling.

### `/event/:eventPublicId/queue`

This standalone route returns the controlled public 404 path. The queue is part of
`/event/:eventPublicId/session`, so there is no second live public queue surface or second EventSource lifecycle.

### `/invite/:inviteCode`

Magic invite link issued or shared by an operator.

Expected future behavior:

1. Validate invite code.
2. If valid, grant participant access for the target event and/or set the participant cookie for that event.
3. Redirect to `/event/:eventPublicId/session`.
4. If invalid, expired, revoked, or already rotated, show a controlled invalid invite state.

Invite links are not submit pages or stable event URLs. They are an access mechanism that can be rotated or revoked; after claim, participation continues on `/event/:eventPublicId/session`.

## Legacy Routes

`/:venueSlug` remains temporarily as a read-only venue page. If it has a discoverable active event, its CTA points to `/event/:eventPublicId`.

The following deprecated routes return 404:

- `/:venueSlug/join`;
- `/:venueSlug/queue`;
- `/:venueSlug/events/:eventSlug`;
- `/:venueSlug/events/:eventSlug/join`;
- `/:venueSlug/events/:eventSlug/queue`.

They deliberately do not redirect through a venue active-event lookup. Such a redirect could select or reveal the wrong event after visibility, lifecycle, or access-policy changes.

Public profile routing through `/@:handle` or `/venue/:venuePublicId` remains a separate future task. This cleanup does not introduce a handle model, profile identifier, or profile redesign.

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

- direct event URL shows public event information according to public visibility policy;
- invite link can grant participant access for the event;
- invite code can be revoked or rotated without changing the event URL;
- participant identity still uses anonymous participant cookie, not accounts;
- participant access must never be passed through query string tokens after the invite has been claimed.
- revoking an invite blocks future claims for that invite code only; it does not revoke already granted participant access.
- rotating an invite changes the usable invite link/code by revoking the old code and issuing a new active code for the event.
- neither revoke nor rotate removes rows from `participant_event_access`; participant access revoke is a separate future capability.

Event visibility and join access are separate dimensions:

- `visibility=public` allows direct event access and future public discovery;
- `visibility=unlisted` allows direct event access by `eventPublicId`, but venue active-event lookup and future discovery must not expose it;
- `visibility=private` is hidden from public detail, queue, submit, my-requests, stream, and invite claim routes with a controlled not-found response;
- `publicJoinEnabled=false` means effective join policy `closed`;
- `publicJoinEnabled=true` with `joinAccessMode=open` means effective join policy `open`;
- `publicJoinEnabled=true` with `joinAccessMode=invite_required` means effective join policy `invite_required` and requires `participant_event_access`.

`invite_required` does not make an event hidden. A public or unlisted invite-required event remains visible through its direct event URL while submit stays blocked until access is granted.

Rules:

- `publicJoinEnabled=false` blocks the join form even for invited or already joined participants.
- `publicQueueEnabled=false` blocks queue visibility inside the participant session according to existing public queue policy.
- Event status still matters:
  - active can accept public submit when join is enabled and access policy allows it;
  - paused blocks submit but may keep queue visible;
  - closed/archived/cancelled follow public visibility policy and must not leak private state.
- Backend remains the source of truth for event, venue, organization, invite, and participant access checks.

## Realtime Implications

Target realtime work should focus on these future surfaces:

- `/@:handle` refreshes public event list / active event after event create, start, pause, resume, close, archive, and cancel.
- `/event/:eventPublicId/session` refreshes:
  - event status;
  - queue snapshot;
  - `publicJoinEnabled`;
  - `publicQueueEnabled`;
  - participant-visible request state;
  - invite/access state when relevant.
- Removed venue-first join and queue routes receive no realtime support.

Realtime implementation should preserve the current safety lessons:

- prefer one bounded stream per live page;
- avoid EventSource-per-event patterns on list pages;
- keep operator mutations and public submit stable even if realtime reconnects;
- keep manual and one-shot focus/visibility refresh as recovery paths; do not add cyclic polling.

## Security Considerations

- Public users must not infer private event, hidden venue, or hidden organization existence.
- Visibility policy must continue to check venue status, venue verification, organization status, event status, and public flags.
- `eventPublicId` must be random enough to avoid enumeration as a practical discovery mechanism.
- `inviteCode` must be separate from `eventPublicId` so it can be revoked or rotated.
- Invite validation must not leak whether a hidden/private event exists.
- Participant cookies and token hashes must remain private; invite handling must not expose participant tokens in response bodies, URLs, logs, or public HTML.
- Handles are public identity only; they must not grant dashboard or operator permission.
- Handle lookup must be case-insensitive and protected against reserved/static path collisions.
- The temporary read-only `/:venueSlug` page must keep reserved slug guards for `sw.js`, `_next`, assets, manifest, robots, sitemap, and similar static paths.

## Implementation Status

Implemented:

- short, random, stable `eventPublicId` in public event URLs;
- `/event/:eventPublicId` informational landing;
- `/event/:eventPublicId/session` participant app with submit, own requests, public queue, and event-scoped SSE;
- `/invite/:inviteCode` claim followed by redirect to the participant session;
- controlled 404 for standalone event queue and venue-scoped join/queue/event-slug routes;
- temporary read-only `/:venueSlug` page linking only to canonical event landings.

Future work:

- decide whether public handles belong to a venue, organization, or brand;
- add `handleDisplay` and case-insensitive `handleNormalized` only with a dedicated data-model task;
- add API lookup and public-web route for `/@:handle`;
- add explicit participant access revoke only if the product requires revoking previously granted access.

## Non-goals

- No `/@:handle` or `/venue/:venuePublicId` profile implementation.
- No standalone `/event/:eventPublicId/queue`; the route returns 404.
- No global `/events` directory.
- No promotion of event slugs as primary public event URLs.
- No participant accounts.
- No dashboard CRUD changes.
- No WebSocket, Redis, BullMQ, or new realtime infrastructure decision.
- No change to existing public API behavior until a follow-up implementation task explicitly does it.
