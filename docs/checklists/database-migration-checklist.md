# Database Migration Checklist

- [ ] Migration is backward compatible or explicitly marked risky.
- [ ] Old code can run on new schema, or deploy order prevents mismatch.
- [ ] New code can tolerate old schema during rollout, or rollout prevents mismatch.
- [ ] Locking impact is considered.
- [ ] Index creation strategy is safe for table size.
- [ ] Backfill is chunked or proven safe.
- [ ] Rollback or roll-forward plan exists.
- [ ] Data loss risk is documented.
- [ ] Migration tested locally/in staging with representative data.
- [ ] Constraints are named and intentional.
