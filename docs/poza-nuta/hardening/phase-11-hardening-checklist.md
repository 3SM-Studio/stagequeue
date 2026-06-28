## Phase 11 hardening checklist

> Status: superseded historical checklist. Keep this file as implementation history, not as
> current routing guidance. Venue-first participant URLs and event-slug placeholders below were
> replaced by the event-first model in `docs/poza-nuta/16-public-routing-and-invite-model.md`.
> Current routes are `/event/:eventPublicId` (landing),
> `/event/:eventPublicId/session` (participant app), and `/invite/:inviteCode` (access claim);
> standalone `/event/:eventPublicId/queue` and venue-scoped join/queue routes return 404.

### P0 — blockers before production demo

- [ ] Remove generated artifacts from package/repo:
  - [ ] `apps/public-web/node_modules`
  - [ ] `apps/public-web/.next-build`
  - [ ] `.next/`
  - [ ] `.next-public/`
  - [ ] `dist/`
  - [ ] `coverage/`
  - [ ] `.turbo/`

- [ ] Verify `.gitignore` ignores generated artifacts:
  - [ ] `node_modules/`
  - [ ] `.next/`
  - [ ] `.next-build/`
  - [ ] `.next-public/`
  - [ ] `coverage/`
  - [ ] `.turbo/`

- [ ] Add package/repo cleanliness check to CI:
  - [ ] Create `scripts/check-clean-package.mjs`
  - [ ] Fail if generated artifacts are found in source/package
  - [ ] Run this check before tests/build in CI

- [ ] Enforce `publicQueueEnabled` in public queue snapshot:
  - [ ] File: `apps/api/src/modules/queue/service.ts`
  - [ ] Function: `getPublicQueue()`
  - [ ] Return `403 FORBIDDEN` when `publicQueueEnabled=false`
  - [ ] Keep existing event status validation

- [ ] Enforce public queue visibility in public SSE stream:
  - [ ] File: `apps/api/src/modules/queue/routes.ts`
  - [ ] Endpoint: `GET /public/events/:eventPublicId/stream`
  - [ ] Check event exists
  - [ ] Check `event.publicQueueEnabled === true`
  - [ ] Check event status is publicly queue-visible
  - [ ] Use same visibility policy as public queue snapshot

- [ ] Extract shared public queue visibility helper:
  - [ ] Suggested helper: `assertPublicQueueVisible(event)`
  - [ ] Use it in queue snapshot
  - [ ] Use it in SSE stream
  - [ ] Add tests so snapshot and stream cannot diverge again

- [ ] Hide public join form when requests are disabled:
  - [ ] File: `apps/public-web/app/[venueSlug]/join/page.tsx`
  - [ ] Do not render `<JoinForm />` when `publicJoinEnabled=false`
  - [ ] Show closed/paused state instead
  - [ ] Keep backend validation in `submitPublicRequest()`

- [ ] Add P0 regression tests:
  - [ ] `GET /public/events/:id/queue` returns `403` when `publicQueueEnabled=false`
  - [ ] `GET /public/events/:id/stream` returns `403` when `publicQueueEnabled=false`
  - [ ] `POST /public/events/:id/requests` returns error when `publicJoinEnabled=false`
  - [ ] Join page does not expose form when `publicJoinEnabled=false`
  - [ ] Paused event does not expose join form
  - [ ] Inactive venue/event state renders correctly

### P1 — before real venue usage

- [ ] Add rate limiting to public request submit:
  - [ ] Endpoint: `POST /public/events/:eventPublicId/requests`
  - [ ] Limit by IP
  - [ ] Limit by event ID
  - [ ] Return clear `429 TOO MANY REQUESTS`
  - [ ] Suggested MVP policy: `5 requests / minute / IP / event`
  - [ ] Suggested stronger policy: `30 requests / hour / IP / event`

- [ ] Define public venue visibility policy:
  - [ ] Decide whether only `active + verified` venues are public
  - [ ] Recommended: public venue must be `active`
  - [ ] Recommended: public venue must be `verified`
  - [ ] Enforce policy in public venue lookup
  - [ ] Add tests for `draft`, `archived`, `pending`, `rejected`

- [ ] Remove or fix dead `/demo` CTA:
  - [ ] File: `apps/public-web/app/page.tsx`
  - [ ] Remove link if no guaranteed demo venue exists
  - [ ] Or add seeded demo venue/event for local dev
  - [ ] Or change CTA to non-clickable documentation/example text
  - [ ] Add test so homepage does not link to missing route

- [ ] Split server and browser API base URLs:
  - [ ] File: `apps/public-web/lib/apiClient.ts`
  - [ ] Add `API_INTERNAL_URL` for SSR/server components
  - [ ] Keep `NEXT_PUBLIC_API_URL` for browser/client components
  - [ ] Server helper fallback: `API_INTERNAL_URL || NEXT_PUBLIC_API_URL || DEFAULT_API_URL`
  - [ ] Browser helper fallback: `NEXT_PUBLIC_API_URL || DEFAULT_API_URL`
  - [ ] Update `.env.example`
  - [ ] Update README

- [ ] Clarify event-specific routes in README:
  - [ ] Mark `/:venueSlug/events/:eventSlug` as placeholder
  - [ ] Mark `/:venueSlug/events/:eventSlug/join` as placeholder
  - [ ] Mark `/:venueSlug/events/:eventSlug/queue` as placeholder
  - [ ] State clearly that MVP uses venue-first active event lookup
  - [ ] Do not describe placeholder routes as completed flow

- [ ] Improve public-web error UX:
  - [ ] Map `403 public queue disabled` to friendly message
  - [ ] Map `409 event paused` to friendly message
  - [ ] Map `409 event not accepting requests` to friendly message
  - [ ] Map `404 venue/event not found` to friendly message
  - [ ] Map `429 too many requests` to friendly message
  - [ ] Keep technical details in logs, not UI

### P2 — 11/10 quality pass

- [ ] Add runtime validation for API responses in public-web:
  - [ ] Validate venue response
  - [ ] Validate active event response
  - [ ] Validate public queue response
  - [ ] Validate submit request response
  - [ ] Use `zod`, `valibot`, or explicit type guards
  - [ ] Fail gracefully on invalid API shape

- [ ] Improve metadata for public pages:
  - [ ] Use venue name, not only slug
  - [ ] Title example: `Karaoke w {venueName} | Poza Nutą`
  - [ ] Title example: `Dołącz do karaoke | {venueName}`
  - [ ] Title example: `Kolejka karaoke | {venueName}`
  - [ ] Keep join page `noindex`
  - [ ] Keep queue page `noindex`
  - [ ] Only allow venue page indexing if venue is public/approved

- [ ] Add public API contract tests:
  - [ ] `GET /public/venues/:venueSlug`
  - [ ] `GET /public/venues/:venueSlug/active-event`
  - [ ] `GET /public/events/:eventPublicId/queue`
  - [ ] `GET /public/events/:eventPublicId/stream`
  - [ ] `POST /public/events/:eventPublicId/requests`
  - [ ] Test response shapes
  - [ ] Test error shapes
  - [ ] Test public flags
  - [ ] Test event statuses
  - [ ] Test venue visibility policy

- [ ] Decide what to do with event-slug flow:
  - [ ] Option A: keep placeholders and document them honestly
  - [ ] Option B: implement real event slug lookup

- [ ] If implementing event-slug flow:
  - [ ] Add `GET /public/venues/:venueSlug/events/:eventSlug`
  - [ ] Ensure event belongs to venue
  - [ ] Ensure event is public-visible
  - [ ] Ensure disabled join/queue flags are respected
  - [ ] Implement `/:venueSlug/events/:eventSlug`
  - [ ] Implement `/:venueSlug/events/:eventSlug/join`
  - [ ] Implement `/:venueSlug/events/:eventSlug/queue`
  - [ ] Add tests for wrong venue/event combination
  - [ ] Add tests for archived event
  - [ ] Add tests for disabled queue
  - [ ] Add tests for disabled join

## Suggested commit plan

- [ ] `chore: remove generated public-web artifacts from package`
- [ ] `fix(api): enforce public queue visibility for snapshots and streams`
- [ ] `fix(public-web): hide join form when public requests are disabled`
- [ ] `test: add public visibility regression coverage`
- [ ] `fix(public-web): remove dead demo CTA`
- [ ] `docs: clarify public-web MVP routes and placeholders`
- [ ] `feat(api): add public request rate limiting`
- [ ] `fix(public-api): restrict public venue visibility`
- [ ] `refactor(public-web): split server and browser API base URLs`
- [ ] `test: add public API contract coverage`
