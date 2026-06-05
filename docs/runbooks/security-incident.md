# Runbook — Security Incident

## Triggers

- leaked secret;
- unauthorized access;
- suspicious admin action;
- dependency compromise;
- production data exposure;
- account takeover pattern.

## Immediate steps

1. Contain: revoke/rotate secret, disable token, block endpoint, pause job, disable account.
2. Preserve evidence: logs, timestamps, affected users/resources.
3. Assess scope: what data/actions were affected.
4. Notify appropriate owners.
5. Patch vulnerability.
6. Add detection/test to prevent recurrence.
7. Complete postmortem and legal/privacy review if needed.

## Secret leak response

- Rotate secret immediately.
- Search logs/repo/history for exposure.
- Invalidate sessions/tokens if affected.
- Review access logs.
- Add secret scanning rule if missing.
