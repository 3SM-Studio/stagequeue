# 10 — Testing and Quality

## Testing goal

Tests are not decoration and coverage is not quality. Tests should catch real regressions in valuable behavior.

## Test pyramid, practical version

Use:

- unit tests for pure logic;
- integration tests for API + DB + auth;
- contract tests for public API response/error shape;
- E2E tests for critical flows;
- accessibility tests for public forms and complex dashboard UI;
- regression tests for bugs that matter.

## What MUST be tested

MUST test:

- domain lifecycle transitions;
- permission/resource access checks;
- public API contracts;
- validation/error mapping;
- DB constraints and important migrations;
- concurrency-sensitive queue behavior;
- webhook idempotency;
- security-sensitive flows;
- critical user journeys.

## What not to over-test

Avoid:

- snapshots for large unstable UI trees;
- mocking everything until tests prove nothing;
- tests that only assert implementation details;
- 20 tests for styling but none for authorization.

## Test data builders

Use builders/seed helpers:

```txt
seedUser()
seedOrganization()
seedVenue()
seedEvent()
seedQueueRequest()
```

MUST NOT copy huge setup blocks across tests.

## Naming tests

Test names should describe behavior:

```txt
rejects public queue access for scheduled events
returns activeEvent null when venue has no active event
prevents operator from editing another organization venue
```

Not:

```txt
test 1
works
should handle data
```

## Mocking policy

Mock external systems. Prefer real DB for repository/integration tests when feasible. Do not mock the database in tests meant to prove SQL/migrations/constraints.

## Flaky tests

Flaky tests are production risk signals.

MUST either:

- fix;
- quarantine with owner and deadline;
- remove if worthless.

Do not normalize rerunning CI until green.

## Coverage

Coverage is a signal, not a target to worship. Low coverage in critical auth/domain code is unacceptable. High coverage in trivial code does not prove quality.

## E2E scope

E2E should cover few critical flows:

- public user submits request;
- operator manages queue;
- dashboard user creates event;
- forbidden user cannot access protected resource.

E2E should not become a slow clone of all unit tests.

## v3 test gate

Every risky change MUST include at least one test that would fail if the critical regression returned.

Required test types by risk:

- domain rule -> unit test;
- resource permission -> integration/contract test;
- public API shape -> contract test;
- DB constraint/concurrency -> integration test;
- user-critical workflow -> E2E smoke;
- bug fix -> regression test.

MUST use builders/fixtures instead of copy-pasting 40 lines of setup in every test.
MUST treat flaky tests as production bugs in the test system.
