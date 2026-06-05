# 15 — Definition of Done and Review Checklists

## Definition of Done

A feature is done when:

- implementation works;
- backend validation exists;
- resource-level authorization exists;
- tests cover valuable behavior;
- public contracts are stable/tested;
- errors are controlled and mapped;
- database constraints/migrations are correct;
- observability is sufficient for the risk;
- docs/env examples are updated;
- no secrets or private data are committed;
- PR explains risk and testing.

If one of these does not apply, say why in the PR.

## Author self-review

Before requesting review:

```txt
I removed debug code.
I checked naming.
I checked comments near changed code.
I ran tests/typecheck.
I considered auth/resource scope.
I checked error behavior.
I checked docs/env changes.
I checked dependency additions.
```

## Reviewer checklist

Reviewer checks:

- correctness;
- architecture/layering;
- domain rules;
- security/auth;
- tests;
- database/migrations;
- API compatibility;
- performance risk;
- observability;
- naming/comments;
- dependency/license risk;
- rollback/deploy risk.

## PR size

A PR is too large if reviewer cannot understand it in one sitting.

Split by:

- migration;
- backend API;
- frontend UI;
- tests;
- refactor;
- docs.

## Blocking reasons

Block merge if:

- auth is missing or unclear;
- public API breaks silently;
- DB migration is unsafe;
- tests do not cover critical behavior;
- secret/private data is present;
- dependency risk is unexplained;
- code violates layer boundaries;
- PR is too large to review safely.

## Technical debt policy

Technical debt is acceptable only when named:

```txt
Debt:
Temporary polling instead of SSE.
Reason:
MVP speed.
Trigger to revisit:
>50 concurrent public queue viewers or operator complaints about freshness.
Owner:
...
```

Unnamed debt is just neglect.

## v3 Definition of Done

A feature is not done until:

- implementation works;
- backend validation exists;
- authorization exists for protected resources;
- critical tests exist;
- public contract changes are documented/tested;
- error codes are stable;
- logs/metrics exist where production debugging needs them;
- migration/release/rollback implications are addressed;
- docs/env/templates are updated if touched;
- PR includes risk and test notes;
- reviewer can understand the change without oral history.
