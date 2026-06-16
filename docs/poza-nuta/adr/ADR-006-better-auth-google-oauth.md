# ADR-006: Better Auth with Google OAuth

## Status

Accepted

## Context

Dashboard users need authenticated access, organization membership checks, platform owner approval, and secure sessions. Participants should not need accounts.

## Decision

Use Better Auth inside the Fastify API. Start with Google OAuth only and httpOnly secure cookies.

## Consequences

Positive: auth lives where permissions live, sessions are API-owned, and organization/venue/event permissions can be evaluated centrally.

Negative: auth setup requires careful cookie, CORS, redirect, and bootstrap-owner handling.

## Notes for implementation

Do not build custom auth. Do not use Supabase Auth, Clerk, Auth0, or NextAuth as the initial authority. Add `BOOTSTRAP_PLATFORM_OWNER_EMAIL` for first-owner provisioning.

### 2026-06 update

`BOOTSTRAP_PLATFORM_OWNER_EMAIL` is development/test-only. In production, first-owner provisioning must use `PLATFORM_SETUP_TOKEN`; setting `BOOTSTRAP_PLATFORM_OWNER_EMAIL` with `NODE_ENV=production` is rejected by API config validation.
