# 13 — Dependencies, Licenses and AI

## Dependency rule

Every dependency is code you operate but do not fully control.

Before adding a runtime dependency, ask:

```txt
What problem does it solve?
Is the problem central or trivial?
Is the package maintained?
How many transitive dependencies?
What is the license?
How do we remove it later?
Does the framework already provide this?
Is this security-sensitive?
```

## When to use packages

Use proven packages for:

- auth/session primitives;
- password hashing;
- cryptography;
- date/timezone handling;
- validation;
- database access;
- payment providers;
- test frameworks;
- parsing complex formats;
- observability libraries.

## When to write it yourself

Write small internal code for:

- domain rules;
- permission policies;
- DTO mappers;
- tiny helpers;
- queue lifecycle logic;
- project-specific workflows.

MUST NOT install packages for trivial helpers like `capitalize` or `sleep` unless there is exceptional reason.

## Dependency governance

Runtime dependency PR must explain:

- why needed;
- alternatives considered;
- maintenance/security signal;
- license;
- removal cost;
- bundle/performance impact if frontend.

## Updates

Use planned dependency updates. Do not let critical security dependencies rot.

MUST test after major framework/library upgrades.

## Licenses

Prefer permissive licenses such as MIT, Apache-2.0, BSD where compatible.

Be careful with GPL/AGPL/commercial assets/fonts/icons/media. Legal/licensing mistakes are not technical debt; they are legal risk.

## Supply chain security

MUST:

- commit lockfiles;
- use dependency scanning;
- pin or review critical dependencies;
- avoid abandoned packages;
- avoid packages with suspicious maintainership changes;
- review postinstall scripts where risk is high.

## AI-assisted development

AI MAY be used for:

- drafts;
- refactors;
- tests;
- documentation;
- research;
- debugging assistance.

AI MUST NOT be treated as authority.

Human developer owns:

- correctness;
- security;
- tests;
- source verification;
- license compliance;
- production behavior.

MUST NOT paste secrets, private customer data, tokens, production dumps or sensitive logs into unapproved AI tools.

## AI review checklist

For AI-generated code:

- Does it compile/typecheck?
- Are APIs real and current?
- Are dependencies legitimate?
- Are edge cases handled?
- Are tests meaningful?
- Is security affected?
- Does it match project architecture?

## v3 dependency gate

New runtime dependency MUST answer:

- What problem does it solve?
- Why not write it locally?
- Why not use existing platform/framework feature?
- Is it maintained?
- What are transitive dependencies?
- What is the license?
- How do we remove/replace it?
- Is it security-sensitive?

AI-generated code MUST be reviewed as untrusted code. The human author owns correctness, licensing, security and maintainability.
