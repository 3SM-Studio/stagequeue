# Runbook — Incident Response

## When to use

Use for production incidents, security-impacting events, data integrity problems, or critical feature outages.

## Steps

1. Declare incident and severity.
2. Assign incident lead.
3. Create shared communication channel.
4. Stabilize: rollback, disable feature, scale, block abuse, or pause jobs.
5. Preserve facts: timestamps, logs, dashboards, deploy version, user impact.
6. Communicate status to stakeholders.
7. Resolve or mitigate.
8. Open postmortem if SEV1/SEV2/security/data incident.

## Severity

```txt
SEV1: unavailable product, data loss, security incident
SEV2: critical flow broken
SEV3: partial degradation
SEV4: low impact
```

## Do not

- Blame individuals.
- Delete evidence/logs.
- Make large unreviewed changes unless needed for emergency stabilization.
- Hide uncertainty.

## v3 incident timeline format

```txt
Time UTC/local:
Event:
Evidence:
Decision:
Owner:
```

## Severity baseline

- SEV1: full outage, data loss, security breach.
- SEV2: critical user/operator workflow down.
- SEV3: partial degradation or important bug with workaround.
- SEV4: low-impact issue.

Every SEV1/SEV2 MUST produce a postmortem and at least one prevention/detection action.
