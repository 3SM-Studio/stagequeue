# 06 — Security, Auth and Privacy

## Security baseline

MUST have:

- backend input validation;
- resource-level authorization;
- secure session/token handling;
- rate limiting for abuse-prone endpoints;
- safe error messages;
- secrets outside git;
- dependency scanning;
- audit logs for admin/security actions;
- secure file upload policy if uploads exist;
- privacy/data retention rules for personal data.

## Authentication vs authorization

Authentication: who are you?  
Authorization: what can you do to this specific resource?

MUST NOT treat `isAuthenticated` as sufficient authorization.

## Sessions and cookies

For first-party web apps, prefer server-owned sessions with secure cookies:

```txt
HttpOnly
Secure
SameSite=Lax or Strict depending on flow
short enough lifetime
rotation where appropriate
CSRF protection for cookie-authenticated unsafe methods
```

## JWT

JWT MAY be appropriate for stateless APIs, mobile clients or service-to-service flows. JWT is not automatically better than sessions.

MUST plan:

- expiration;
- refresh/rotation;
- revocation;
- key rotation;
- audience/issuer validation;
- storage location;
- token leakage in logs.

## Password storage

MUST NOT store plaintext passwords.

MUST NOT use MD5, SHA1, SHA256 or plain HMAC as password storage.

Prefer:

```txt
Argon2id
bcrypt with appropriate cost
scrypt where appropriate
PBKDF2 for compliance/FIPS-driven cases
```

Use per-password salts provided by the password hashing library. Pepper MAY be used if stored in a real secret manager and rotation is planned.

## Password policy

Prefer modern password policy:

- allow long passwords;
- allow spaces and Unicode where possible;
- avoid forced composition rules that reduce usability;
- block known compromised/common passwords;
- rate limit login;
- support MFA/passkeys for privileged users.

## API keys

MUST store only a hash of API key secret material.

Recommended DB fields:

```txt
id
key_prefix
key_hash
scopes
created_at
last_used_at
revoked_at
```

Show plaintext API key only once.

## Secrets

MUST NOT commit secrets.

Use:

- environment variables for deployment config;
- secret manager/provider secrets for production;
- `.env.example` with fake values;
- secret scanning in CI;
- rotation plan.

## CSRF

If cookies authenticate unsafe methods, use CSRF protection strategy:

- SameSite cookies;
- Origin/Referer checks;
- CSRF tokens where needed;
- no state-changing GET requests.

## XSS

MUST:

- escape output;
- avoid unsafe HTML injection;
- sanitize user-provided HTML if HTML is allowed;
- use HttpOnly cookies to reduce token theft risk;
- consider CSP for production.

## CORS

CORS is not authorization.

MUST NOT use wildcard origin with credentials.

Use explicit allowlists per environment.

## Rate limiting

MUST rate limit:

- login;
- password reset;
- public submissions;
- webhook endpoints;
- expensive search;
- realtime connection attempts.

Use composite limits when possible: IP + account/email + organization + endpoint.

## File uploads

If uploads exist, MUST define:

- allowed extensions;
- MIME checks;
- size limits;
- storage outside executable paths;
- random server-side filenames;
- malware scanning if risk warrants it;
- image transformation safety;
- private/public access rules.

## Privacy

MUST define personal data inventory:

- what data is collected;
- why;
- who can access it;
- retention period;
- deletion/export procedure;
- whether it appears in logs/backups.

Data minimization is not bureaucracy. It is risk reduction.

## Security review triggers

Require security review for:

- auth/session changes;
- permission model changes;
- public write endpoints;
- file uploads;
- payment/webhook handling;
- secret handling;
- admin/audit features;
- tenant/organization access logic.

## v3 security gate

Any PR touching auth, permissions, sessions, tokens, public endpoints, file uploads, webhooks, logging of user data, or organization/tenant scope MUST use `docs/checklists/security-review-checklist.md`.

MUST distinguish:

```txt
authentication: who is the actor?
authorization: can this actor do this action on this resource now?
audit: will we know who did it later?
```

MUST NOT store password hashes, tokens, API keys, session IDs or reset tokens in logs.
