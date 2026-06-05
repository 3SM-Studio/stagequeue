# API Endpoint Checklist

Use for every new or changed endpoint.

## Contract

- [ ] Endpoint name follows resource/action rule.
- [ ] Request params/query/body are schema-validated.
- [ ] Response DTO is explicit and does not expose raw DB record.
- [ ] Error format uses stable `error.code`.
- [ ] List endpoint has pagination if it can grow.
- [ ] Filters/sorts are allowlisted.
- [ ] Public response shape is contract-tested.

## Security

- [ ] Authentication requirement is explicit.
- [ ] Authorization checks target the actual resource.
- [ ] 404 vs 403 behavior is intentional.
- [ ] Rate limit is considered for public/expensive endpoints.
- [ ] No stack traces/provider/SQL details leak.

## Operations

- [ ] Useful log context exists.
- [ ] Idempotency is used if retries can duplicate state.
- [ ] Metrics/alerts considered for critical endpoint.
