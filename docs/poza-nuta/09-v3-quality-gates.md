# Poza Nutą — v3 Quality Gates

These gates supplement the general standards.

## Required GitHub check

Protect `main` with the GitHub Actions check:

```txt
Repository CI / Quality gates
```

This check comes from `.github/workflows/ci.yml`. Branch protection should
require pull requests, passing status checks, no force pushes and no deletion of
`main`. Requiring branches to be up to date before merging is optional and may
be enabled if the team wants stricter merge freshness.

## Event/venue/queue PRs MUST check

- [ ] Platform owner path is tested.
- [ ] Organization/venue operator path is tested.
- [ ] Public anonymous path is tested if public endpoint touched.
- [ ] Archived/cancelled/scheduled/active status behavior is explicit.
- [ ] Public API returns stable shape.
- [ ] Queue operations are safe under duplicate/concurrent submission.
- [ ] Slug uniqueness is protected by DB constraint, not only app code.
- [ ] Permission checks use organization/venue/event scope, not only user role.

## Realtime default

- Public/operator queue live updates SHOULD use SSE before WebSocket.
- HTTP POST/PATCH remains the default for commands/actions.
- WebSocket requires ADR with bidirectional need.

## Security default

- Public submissions MUST be rate-limited.
- Private/non-public events SHOULD return 404 to anonymous users when revealing existence is a risk.
- Admin/operator actions SHOULD be audit logged.
