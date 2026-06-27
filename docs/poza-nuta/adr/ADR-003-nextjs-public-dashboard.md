# ADR-003: Next.js for public and dashboard apps

## Status

Accepted

## Context

The prototype uses a Vite React app. The target product needs SEO-capable public venue pages and protected dashboard routes.

## Decision

Use Next.js for both `apps/public-web` and `apps/dashboard-web`. Deploy both on Vercel.

## Consequences

Positive: public venue pages can use SSR/metadata/OpenGraph, dashboard routes can use server-side session checks, and Vercel deployment is straightforward.

Negative: the prototype Vite app was retired after the Next.js public and dashboard flows reached equivalent
coverage.

## Notes for implementation

The former `apps/web` prototype has been removed. Public and dashboard frontend work belongs only in
`apps/public-web` and `apps/dashboard-web`.
