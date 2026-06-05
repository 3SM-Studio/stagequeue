# Backend Endpoint Implementation Checklist

- [ ] Route/controller is thin.
- [ ] Schema validation is separate or clearly declared.
- [ ] Policy/authorization is separate from business logic.
- [ ] Service/use-case owns workflow.
- [ ] Repository owns DB access.
- [ ] Mapper owns DTO transformation.
- [ ] Domain errors map to HTTP errors centrally.
- [ ] Tests cover happy path and at least one meaningful failure path.
- [ ] Logs include request/resource context but no secrets.
- [ ] Transaction boundaries are explicit when state changes multiple records.
