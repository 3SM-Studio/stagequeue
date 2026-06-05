# 05 — Database and Data Modeling

## Core rule

The database is not dumb storage. It is a consistency boundary.

Application code validates intent. The database defends integrity under concurrency.

## Naming

Recommended:

```txt
Tables: plural snake_case       events, venues, queue_requests
Columns: snake_case             created_at, venue_id, public_id
Primary key: id
Foreign key: <entity>_id
Indexes: <table>_<columns>_<purpose>_idx
Unique indexes: <table>_<columns>_unique
```

## IDs

Use separate concepts:

- internal primary key: stable database identity;
- public id: safe external identifier;
- slug: human-readable URL segment;
- provider id: external source identity.

MUST NOT expose sequential internal IDs publicly if enumeration matters.

## Constraints

Use constraints for invariants:

```sql
not null
foreign key
unique
check
```

Examples:

```sql
unique (venue_id, slug)
check (status in ('draft', 'scheduled', 'active', 'paused', 'closed', 'archived', 'cancelled'))
```

## Indexes

Add indexes for real query patterns:

- foreign keys used in joins;
- lookup by slug/public id;
- active event lookup;
- dashboard lists by organization/venue/status;
- queue ordering;
- job status/next run.

Use `EXPLAIN`/query plans for performance-sensitive queries.

## Migrations

MUST be versioned and committed.

MUST NOT manually patch production schema without recording a migration.

For risky changes, prefer expand-and-contract:

1. add new nullable column/table/index;
2. deploy code that writes both old and new if needed;
3. backfill;
4. deploy code that reads new;
5. remove old only later.

## Transactions

Use transactions around multi-step operations that must stay consistent:

- create event + audit log;
- queue request creation + ordering;
- status transition + derived state;
- webhook processed marker + side effect enqueue.

Keep transactions short. Do not perform slow external HTTP calls inside DB transactions.

## Concurrency

MUST treat concurrency as real even in small products.

Use:

- unique constraints for duplicate prevention;
- row locking for contested updates;
- optimistic locking/version columns when appropriate;
- idempotency keys for retries;
- retry strategy for serialization/conflict errors.

## Queue modeling

Queue systems need explicit decisions:

- Is position stored or calculated?
- Can users cancel?
- Can operators reorder?
- Is history immutable?
- What happens under concurrent submissions?
- What is the source of truth for current order?

Do not calculate queue position by `count(*) + 1` without concurrency protection. That is localhost logic, not production logic.

## Soft delete vs hard delete

Use soft delete for business records requiring audit/history. Use hard delete for disposable technical data. For privacy requests, anonymization or hard deletion may be required depending on legal/product requirements.

## Timestamps

MUST store machine timestamps in UTC. UI must display explicit timezone context.

Recommended columns:

```txt
created_at
updated_at
archived_at
deleted_at
```

## Audit data

For sensitive administrative operations, store audit events separately from debug logs.

## v3 migration gate

A production migration MUST declare:

- whether it is backward compatible;
- whether old code can run on new schema;
- whether new code can run on old schema;
- expected lock behavior;
- estimated row count touched;
- rollback or roll-forward plan;
- data backfill strategy;
- index strategy;
- test plan.

MUST NOT drop or rename columns in the same deploy that first stops using them. Use expand-and-contract.

Concurrency rule: if correctness depends on “nobody else writes between these two statements”, you need a transaction, lock, uniqueness constraint, idempotency key or optimistic version check.
