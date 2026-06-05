# Runbook — Backup and Restore

## Policy

A backup that was never restored in a test is not a proven backup.

## Define

- systems backed up;
- schedule;
- retention;
- encryption;
- access control;
- RPO;
- RTO;
- restore test cadence.

## Restore test

1. Select backup snapshot.
2. Restore into isolated environment.
3. Run integrity checks.
4. Run application smoke tests.
5. Record duration and issues.
6. Update runbook if procedure changed.

## Data privacy

Restored production data in non-production must follow privacy/access policy.

## v3 restore drill rule

A restore test SHOULD be performed on a schedule and after major infrastructure changes. Document last successful restore date, dataset, duration and operator.
