# ADR-003: Next.js for public and dashboard apps

## Status

Accepted

## Context

The prototype uses a Vite React app. The target product needs SEO-capable public venue pages and protected dashboard routes.

## Decision

Use Next.js for both `apps/public-web` and `apps/dashboard-web`. Deploy both on Vercel.

## Consequences

Positive: public venue pages can use SSR/metadata/OpenGraph, dashboard routes can use server-side session checks, and Vercel deployment is straightforward.

Negative: the existing Vite app becomes legacy reference material and should not be treated as the target frontend.

## Notes for implementation

Keep `apps/web` temporarily as a prototype reference. Do not build new target UI work in Vite unless it is explicitly scoped as legacy/prototype work.
