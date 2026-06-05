# Security Review Checklist

Use when PR touches auth, permissions, public endpoints, secrets, sessions, tokens, uploads, webhooks, logging or tenant scope.

- [ ] Actor identity is authenticated correctly.
- [ ] Authorization is checked against the actual resource.
- [ ] Organization/tenant scope cannot be bypassed.
- [ ] Input validation runs on backend.
- [ ] Output does not leak private resource existence unless intended.
- [ ] Secrets/tokens/passwords do not enter logs or responses.
- [ ] Rate limiting/abuse prevention considered.
- [ ] CSRF/XSS/CORS implications considered.
- [ ] Webhook/file upload signature/type/size validation exists where relevant.
- [ ] Audit logging exists for admin/security-sensitive actions.
- [ ] Tests cover forbidden access.
