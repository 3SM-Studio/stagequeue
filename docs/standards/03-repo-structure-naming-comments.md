# 03 — Repo Structure, Naming and Comments

## Recommended repository structure

For a full-stack product:

```txt
apps/
  public-web/
  dashboard-web/
  api/
  worker/
packages/
  db/
  domain/
  shared/
  config/
docs/
  standards/
  adr/
  runbooks/
  product/
scripts/
tests/
```

Use monorepo only if it reduces coordination cost. Do not use monorepo as architectural cosplay.

## Folder ownership

- `apps/*`: runnable applications.
- `packages/db`: schema, migrations, database client.
- `packages/domain`: shared domain types and pure rules.
- `packages/shared`: cross-cutting utilities with real reuse.
- `docs/adr`: decisions.
- `docs/runbooks`: operational procedures.

## File naming

React components use PascalCase:

```txt
CreateEventForm.tsx
EventStatusBadge.tsx
DashboardEventsView.tsx
```

Hooks use `useX`:

```txt
useCreateEventForm.ts
useDebouncedSearch.ts
```

Backend/use-case files use explicit domain names:

```txt
createEvent.service.ts
createEvent.schema.ts
eventRepository.ts
eventPolicy.ts
mapEventToPublicDto.ts
```

Python files use snake_case:

```txt
create_event.py
event_repository.py
event_lifecycle.py
```

## Suspicious names

Avoid or challenge:

```txt
utils.ts
helpers.ts
data.ts
stuff.ts
new.ts
test2.ts
manager.ts
processor.ts
```

They are not always forbidden, but they are guilty until proven useful.

## Function naming

Functions should be verbs or questions:

```ts
createEvent()
archiveEvent()
calculateQueuePosition()
canUserManageVenue()
isEventPubliclyJoinable()
assertCanManageEvent()
mapEventToPublicDto()
```

Boolean names should read as booleans:

```ts
isActive
hasPermission
canJoinQueue
shouldShowQueue
```

## Variable naming

Prefer domain names:

```ts
venueSlug
organizationId
queueRequest
publicJoinEnabled
operatedByOrganizationId
```

Avoid vague names outside tiny local scopes:

```txt
data
item
obj
res
result
flag
```

## Comments standard

Comments explain why, not what.

Good comment:

```ts
// Keep `activeEvent: null` instead of omitting it.
// Public clients rely on a stable response shape.
return { venue, activeEvent }
```

Bad comment:

```ts
// Return response
return reply.send(response)
```

## Where comments are valuable

MUST comment non-obvious:

- business exceptions;
- security decisions;
- cache rules;
- concurrency/race-risk code;
- integration workarounds;
- migration constraints;
- SSE/WebSocket heartbeat and cleanup logic;
- intentionally hidden 404/403 behavior;
- public API compatibility decisions.

## TODO/FIXME/HACK

MUST include context and preferably an issue ID:

```ts
// TODO(PN-142): Replace polling with SSE after queue stream endpoint is deployed.
```

MUST NOT write:

```ts
// TODO fix later
```

That is not documentation. That is litter.

## Module README files

Use module README files only for important boundaries. Example:

```md
# Events module

Owns event lifecycle and event visibility rules.
Does not own queue ordering rules.
Forbidden dependencies: React components, Fastify request/reply outside api/.
```
