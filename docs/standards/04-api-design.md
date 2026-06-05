# 04 — API Design

## Goals

API design must optimize for:

- stable contracts;
- clear authorization;
- predictable errors;
- pagination from the start;
- compatibility;
- testability;
- safe evolution.

## Resource and action endpoints

Use resource endpoints for normal CRUD:

```txt
GET    /events
GET    /events/:eventId
POST   /events
PATCH  /events/:eventId
DELETE /events/:eventId
```

Use action endpoints for domain transitions:

```txt
POST /events/:eventId/activate
POST /events/:eventId/archive
POST /queue-requests/:requestId/approve
```

If the operation has business rules beyond setting fields, it is probably an action.

## HTTP status codes

Default mapping:

```txt
200 OK                    successful read/update
201 Created               resource created
202 Accepted              async job accepted
204 No Content            successful delete/no body
400 Bad Request           malformed request or validation error
401 Unauthorized          no valid authentication
403 Forbidden             authenticated but not allowed
404 Not Found             missing resource or intentionally hidden resource
409 Conflict              state conflict / uniqueness conflict
422 Unprocessable Entity  semantically invalid input if 400 is too broad
429 Too Many Requests     rate limited
500 Internal Server Error unexpected server error
```

## Error format

MUST return stable error codes:

```json
{
  "error": {
    "code": "EVENT_SLUG_CONFLICT",
    "message": "Event slug already exists.",
    "details": {}
  }
}
```

MUST NOT expose stack traces, SQL errors, provider secrets or internal implementation details.

## Pagination

MUST paginate list endpoints before they can grow.

Recommended default:

```txt
GET /events?limit=50&cursor=...
```

Response:

```json
{
  "items": [],
  "pageInfo": {
    "nextCursor": null,
    "hasNextPage": false
  }
}
```

Offset pagination MAY be used for admin/reporting screens where consistency is not critical. Cursor pagination SHOULD be used for large or changing datasets.

## Filtering and sorting

Filtering and sorting MUST be allowlisted. Do not pass arbitrary client field names directly into SQL/order clauses.

```txt
GET /events?status=active&venueId=...&sort=startTime:desc
```

## Idempotency

Use idempotency keys for operations where retry can create duplicates:

- public submissions;
- payments;
- webhook processing;
- imports;
- email sending;
- job creation.

Recommended header:

```txt
Idempotency-Key: <client-generated-unique-key>
```

## DTO policy

MUST separate:

```txt
DB record != Domain model != Public DTO != Dashboard DTO
```

MUST NOT return raw DB records to public clients.

## Versioning and compatibility

Prefer additive changes:

- add fields, do not rename fields;
- keep nullable fields when clients depend on stable shape;
- deprecate before removal;
- use API contract tests for public endpoints.

Breaking changes require an ADR or release note.

## OpenAPI/schema

SHOULD maintain machine-readable API schema for public or multi-client APIs.

For Fastify, prefer route schemas close to routes and derive documentation/tests where possible.

## Webhooks

Webhook endpoints MUST:

- verify provider signature;
- use raw body if provider requires it;
- tolerate retries;
- be idempotent;
- return quickly;
- push heavy work to background jobs;
- log event id and provider.

## v3 review gate

Every new or changed endpoint MUST answer:

- Who can call it?
- What resource scope is enforced?
- What validation schema protects it?
- What DTO is returned?
- What stable error codes can it return?
- Is the response shape contract-tested?
- Does it need idempotency?
- Does it need pagination/filtering/sorting allowlists?
- Does it reveal resource existence where it should not?

Bad endpoint smell:

```txt
route handler contains validation + auth + SQL + mapping + side effects + logging in one function
```

Good endpoint shape:

```txt
route -> schema validation -> auth/policy -> service/use-case -> repository -> mapper -> response
```
