# ADR-009: Organization-to-venue access

## Status

Accepted

## Context

Access to operate karaoke at a venue should survive individual staff changes. A venue may be operated by a company, agency, independent host, or venue owner organization.

## Decision

Grant venue access to organizations through `venue_organization_access`. Users gain operational ability through active organization membership and relevant permissions.

## Consequences

Positive: organization access is stable, staff can change without losing venue history, and permissions can be managed at the right level.

Negative: every venue/event operation must check organization membership and active venue access.

## Notes for implementation

Do not grant venue access directly to individual users as the primary model. Removed organization members must lose access even if old event assignment rows remain.
