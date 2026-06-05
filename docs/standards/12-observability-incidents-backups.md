# 12 — Observability, Incidents and Backups

## Observability goal

Production must not be a dark room.

Use three core signal types:

- logs: events that happened;
- metrics: aggregate measurements;
- traces: path of a request/operation through the system.

## Logging

Use structured logs.

Include:

```txt
timestamp
level
message
request_id
user_id where safe
organization_id where relevant
resource id
error code
```

MUST NOT log passwords, full tokens, secrets or unnecessary personal data.

## Metrics

Technical metrics:

- request latency;
- error rate;
- DB query duration;
- job failures;
- queue depth;
- rate limit hits;
- SSE/WebSocket connections/disconnects.

Business metrics:

- active events;
- public submissions;
- queue length;
- operator actions;
- failed submissions;
- import results.

## Tracing

Use tracing for multi-step flows:

- public request submission;
- event activation;
- queue reorder;
- import jobs;
- webhook processing.

## Alerts

Alerts should page for user impact or imminent risk, not noise.

Examples:

- API error rate above threshold;
- public submission failure spike;
- worker stuck;
- database connection exhaustion;
- backups failing;
- security rate limit spike.

## Incident severity

Suggested levels:

```txt
SEV1: product unavailable or data/security incident
SEV2: critical flow broken
SEV3: partial degradation or workaround exists
SEV4: low-impact issue
```

## Incident response

During incident:

1. assign incident lead;
2. stabilize/mitigate;
3. communicate status;
4. preserve facts/timeline;
5. rollback/disable feature if needed;
6. create postmortem for significant incidents.

## Postmortem

Postmortems should be blameless and factual:

- summary;
- impact;
- timeline;
- root causes/contributing factors;
- what went well;
- what went poorly;
- action items with owners and deadlines.

## Backups

A backup not restored in a test is hope, not backup.

MUST define:

- what is backed up;
- schedule;
- retention;
- restore procedure;
- RPO;
- RTO;
- restore test cadence;
- who can restore.

## Disaster recovery

Know what happens if:

- database is lost;
- deployment provider is down;
- secret leaks;
- worker duplicates jobs;
- migration corrupts data;
- a bad release breaks public flow.

## v3 operations gate

A production feature SHOULD define:

- useful logs;
- metrics;
- alert symptoms;
- dashboard/query for debugging;
- correlation/request ID path;
- failure modes;
- runbook updates.

Backup rule: a backup that has never been restored is an assumption, not a backup.
