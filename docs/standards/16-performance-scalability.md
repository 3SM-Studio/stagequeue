# 16 — Performance and Scalability

## Performance principle

Do not optimize everything. Do not ignore obvious waste.

Senior performance work is risk-based:

- measure before complex optimization;
- prevent known bad patterns early;
- set budgets for critical paths;
- design escape hatches.

## Frontend performance

Watch:

- Core Web Vitals: LCP, INP, CLS;
- JS bundle size;
- hydration cost;
- image size;
- unbounded client lists;
- unnecessary client components;
- repeated fetch waterfalls;
- blocking third-party scripts.

MUST avoid `"use client"` at high layout levels without reason.

## Backend performance

Watch:

- N+1 queries;
- missing indexes;
- unbounded list endpoints;
- slow transactions;
- excessive DB connections;
- synchronous external calls in requests;
- heavy work not moved to jobs;
- inefficient search.

## Database performance

Use:

- pagination;
- indexes matching query patterns;
- `EXPLAIN` for slow queries;
- connection pool sizing;
- query timeouts;
- background jobs for heavy work.

## Connection pools

Compute total possible DB connections:

```txt
instances * pool_max <= database safe connection limit
```

Serverless/auto-scaling can create connection storms. Plan pooling/proxy strategy if needed.

## Scalability path

Start simple, but know next step:

```txt
single API instance -> API + worker -> multiple API instances + pub/sub -> stronger queue/broker if needed
```

MUST NOT start with Kubernetes/Kafka/microservices unless the product needs justify operational cost.

## Load testing triggers

Run load/smoke tests before:

- public launch;
- large events;
- realtime fanout;
- import jobs;
- endpoint expected to be high traffic;
- changing DB queries for critical flows.
