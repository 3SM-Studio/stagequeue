# ADR-008: Global song catalog

## Status

Accepted

## Context

The prototype imports iSing metadata into a local JSON file. The platform needs a global catalog shared across venues and organizations.

## Decision

The catalog is platform-owned and global. Sources include iSing and KaraFun. Imported tracks live in database tables keyed by source and source track id.

## Consequences

Positive: venues and events share one catalog, imports can be audited, and future source expansion is possible.

Negative: source normalization, availability, and import jobs must be designed explicitly.

## Notes for implementation

Keep cautious iSing importer rules. Do not create per-venue catalogs. Do not aggressively auto-merge iSing and KaraFun tracks at the MVP stage.
