# 14 — Documentation and Onboarding

## Documentation types

Use the right document for the right job:

```txt
standards/   how we generally work
adr/         why we made a significant decision
runbooks/    how to operate or recover
product/     how users/operators use the system
README       how to start and navigate
comments     why local code does something non-obvious
```

## ADRs

Use ADRs for decisions that future maintainers will question:

- architecture;
- auth/session strategy;
- realtime strategy;
- database ID strategy;
- provider choice;
- hosting model;
- large dependency;
- deliberate technical debt.

ADR should include:

```txt
Status
Context
Decision
Consequences
Alternatives considered
Implementation notes
Review date if relevant
```

## Runbooks

Runbooks are procedures, not essays.

Good runbook:

- when to use;
- prerequisites;
- step-by-step commands/actions;
- validation;
- rollback;
- escalation;
- links to dashboards/logs.

## Onboarding docs

MUST document:

- prerequisites;
- install;
- env setup;
- local services;
- running tests;
- running apps;
- common tasks;
- how to add a feature;
- how to open a PR;
- how to deploy if applicable.

## Documentation quality

Docs must be:

- short enough to use;
- specific enough to act on;
- linked from index;
- updated with behavior changes;
- owned by the team.

A stale doc is worse than no doc when it confidently lies.

## Product/operator docs

If the product requires operators/admins, documentation is part of the product.

Operator docs should explain:

- common workflows;
- permissions;
- failure states;
- what to do when something goes wrong;
- screenshots if helpful;
- support escalation.
