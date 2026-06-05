# Poza Nutą — Security and Privacy Baseline

## Data likely handled

```txt
user account identity
Google OAuth identity/email
organization membership
venue access
operator/staff actions
public singer/display names
queue requests
catalog search/import data
logs/audit events
```

## Baseline rules

MUST:

- use httpOnly secure cookies for dashboard sessions;
- centralize auth/permissions in Fastify API;
- validate all public submissions backend-side;
- rate limit public submission endpoints;
- prevent operator access across organizations/venues;
- log audit events for admin/operator-sensitive actions;
- keep secrets outside repo;
- keep `.env.example` fake and current;
- avoid PII in logs where not necessary;
- define retention for queue submissions and logs.

## Public forms

MUST protect against:

- spam submissions;
- duplicate submissions;
- overlong names/song fields;
- script/HTML injection;
- event enumeration;
- joining inactive/private events.

## CORS/cookies

Because public/dashboard/API domains are separated, CORS and cookies must be configured deliberately per environment. Wildcard origins with credentials are forbidden.

## Audit events

Audit at least:

- venue access changes;
- event creation/status changes;
- queue moderation/reorder actions;
- organization membership changes;
- platform owner bootstrap/change.

## Privacy open decisions

Need product/legal decisions for:

- how long queue requests are retained;
- whether public singer names are personal data in product context;
- deletion/anonymization behavior for historical events;
- export/delete request process;
- whether phone/email is ever collected from participants.
