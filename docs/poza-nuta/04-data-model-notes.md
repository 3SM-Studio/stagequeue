# Poza Nutą — Data Model Notes

## Core model

```txt
organizations
users
organization_memberships
venues
venue_organization_access
events
event_staff_assignments
queue_requests
queue_request_history / audit events
catalog_tracks
catalog_sources
jobs
outbox_events
audit_logs
```

## Venue-first model

Venue is the durable public anchor. Events belong to venues. Queues belong to events.

## IDs

Recommended:

- internal DB primary key for joins;
- public id for event/public URLs where needed;
- venue slug for public venue page;
- source track id for imported catalog items.

## Constraints

Required candidates:

```txt
unique venues.slug
unique events(public_id)
unique events(venue_id, slug) if event slugs exist
one active/paused event per venue
foreign keys for venue/event/request relationships
check constraints for status fields
```

## Event statuses

Known statuses from current work:

```txt
draft
scheduled
active
paused
closed
archived
cancelled
```

Event lifecycle transitions must live in domain rules and be tested.

## Queue request model

Queue request must capture:

- event id;
- singer/display name;
- song selection/free text depending on catalog flow;
- status;
- ordering state;
- timestamps;
- moderation/audit information;
- duplicate/idempotency strategy.

## Catalog

Global catalog is platform-owned. Imported tracks keyed by source + source track id. Do not aggressively auto-merge different providers at MVP.

## Audit and history

Audit administrative actions:

- event created/activated/archived;
- queue request approved/rejected/reordered;
- venue visibility changed;
- organization access changed;
- staff assignment changed.
