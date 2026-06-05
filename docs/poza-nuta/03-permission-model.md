# Poza Nutą — Permission Model

## Actors

```txt
anonymous public user
participant submitting queue request
dashboard user
organization member
venue operator
lead host
queue operator
viewer
organization owner/admin
platform owner
worker/system actor
```

## Core rule

Every protected operation MUST check resource-level access through organization, venue, event and staff assignment where relevant.

MUST NOT rely on broad `isAdmin` flags.

## Permission layers

```txt
session -> user -> organization membership -> venue organization access -> event staff assignment -> action policy
```

## Public users

Public users may:

- view public venue page if visible;
- view active public event if public visibility allows;
- submit queue request if event is active and public joining is enabled;
- view public queue if public queue is enabled.

Public users must not infer private event existence. Return 404 where hiding existence is intentional.

## Dashboard users

Dashboard users require:

- authenticated session;
- active organization membership;
- relevant venue access;
- relevant event permission/staff assignment for event operations.

## Platform owner

Platform owner can perform platform-level operations, but actions still should be audited. Platform owner bypasses must be explicit and commented/testable.

## Policy functions

Recommended policy names:

```ts
assertCanManageVenue(user, venue)
assertCanCreateEventForVenue(user, venue)
assertCanOperateEvent(user, event)
assertCanViewDashboardQueue(user, event)
assertCanModerateQueueRequest(user, request)
canPublicUserJoinQueue(event)
canPublicUserViewQueue(event)
```

## Tests required

MUST test:

- operator from org A cannot modify venue/event of org B;
- removed organization member loses access;
- public user cannot join scheduled/archived/closed/private event;
- platform owner path is explicit;
- event staff assignment scopes event operations.
