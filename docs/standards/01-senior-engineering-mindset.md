# 01 — Senior Engineering Mindset

A senior developer is not someone who knows the most packages. A senior developer reduces product, security, operational and maintenance risk through good technical judgment.

## Core identity

Senior behavior is ownership behavior:

- understand the problem before choosing a tool;
- ask what breaks, who is affected, and how to recover;
- choose the simplest safe design, not the most impressive design;
- communicate risk clearly;
- leave code easier to change than before;
- refuse unsafe shortcuts;
- document decisions that future maintainers will question.

## Decision questions

Before implementing, ask:

```txt
What problem are we solving?
Who uses this?
What data is touched?
What is the failure mode?
How do we validate input?
Who is authorized to do this?
How is it tested?
How is it deployed?
How is it rolled back?
How will production tell us if it fails?
```

If you cannot answer those questions, you are not ready to merge. You may still be ready to prototype, but then label it as prototype.

## Trade-off thinking

Every feature has cost:

- implementation cost;
- operational cost;
- security cost;
- cognitive load;
- migration cost;
- dependency cost;
- testing cost;
- rollback cost;
- onboarding cost.

A weak developer asks: "Can we build it?" A senior asks: "Should we build it this way?"

## No tool worship

MUST NOT treat any tool as religion: Next.js, Fastify, Python, GraphQL, WebSocket, Redis, Kubernetes, microservices, clean architecture or AI.

The correct statement is:

```txt
For this problem, in this team, with these constraints, the best trade-off is X.
```

## Simplicity without negligence

Simplicity is good:

- small modules;
- clear names;
- explicit dependencies;
- boring code;
- few moving parts.

Negligence is not simplicity:

- no tests;
- no authorization;
- no validation;
- secrets in repo;
- manual production fixes;
- "we will fix it later" without a ticket.

## Saying no

A senior MUST say no to:

- custom auth without exceptional reason;
- cryptography invented in-house;
- WebSocket when SSE or polling is enough;
- runtime dependencies for trivial helpers;
- PRs too large to review safely;
- changes that bypass resource-level authorization;
- silent breaking changes to public API contracts.

Say no with a better path, not ego.

## Responsibility after merge

Code is not done at merge. It is done when it can be operated:

- logs exist;
- failures are visible;
- rollback is possible;
- users receive safe errors;
- support/operators know what to do;
- incidents produce learning, not blame.

## AI use mindset

AI is a force multiplier, not an authority. Treat AI-generated code like code from a fast junior: useful, but requiring review, tests, source checks and security scrutiny.

## v3 enforcement rules

MUST communicate risk in this shape when risk is non-trivial:

```txt
Risk:
Impact:
Mitigation:
Test/monitoring:
Rollback:
```

MUST NOT merge work that you cannot explain operationally: what breaks, how it is detected, how it is rolled back, and who is affected.

A senior decision is not “I prefer X”. It is “X is the best trade-off because Y; rejected alternatives were Z; revisit when W happens”.
