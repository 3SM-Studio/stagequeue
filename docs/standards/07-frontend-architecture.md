# 07 — Frontend Architecture

## Goals

Frontend should be:

- accessible;
- fast enough;
- clear in data ownership;
- thin on business logic;
- resilient to backend errors;
- easy to test;
- consistent visually.

## React/Next.js mental model

Default for Next.js App Router:

- Server Components for data fetching and non-interactive rendering;
- Client Components for interaction, browser APIs and local state;
- Server Actions/Functions only where their trade-offs are understood;
- explicit cache choices.

MUST NOT mark whole trees as `"use client"` just because one button is interactive. Extract the interactive island.

## Server state vs client state

Server state:

```txt
events
venues
queue
current user
permissions
catalog search results
```

Client state:

```txt
modal open/closed
selected tab
form draft
temporary filters
optimistic UI state
```

MUST NOT dump server state into a global client store by default.

## State tools

Use the smallest adequate tool:

- `useState`: local simple UI state;
- `useReducer`: complex local transitions;
- context: dependency/config/current user info with limited updates;
- TanStack Query or equivalent: client-side server state when needed;
- Zustand/Jotai/etc.: only for real shared client state.

## Forms

Simple forms MAY use native form behavior or small controlled/uncontrolled logic.

Complex forms SHOULD use a form library and schema validation.

MUST still validate on backend.

## API client

Frontend API clients should:

- centralize base URL and credentials;
- parse known error format;
- avoid leaking raw `fetch` handling everywhere;
- keep DTOs typed;
- not contain business authorization logic.

## Error/loading/empty states

Every data-driven screen SHOULD define:

- loading state;
- empty state;
- recoverable error state;
- permission denied state where relevant.

## Design system

Create shared components when repeated:

```txt
Button
Input
FormField
Modal
Dialog
EmptyState
ErrorState
LoadingState
StatusBadge
```

MUST NOT create five visually different buttons because each screen did its own thing.

## Accessibility baseline

See `17-accessibility-i18n-ux.md` for full rules. Frontend PRs MUST consider semantic HTML, labels, keyboard navigation and focus management.

## Performance baseline

MUST avoid:

- unnecessary client components;
- excessive bundle size;
- unbounded lists;
- unoptimized images;
- hydration of data-only UI;
- repeated client fetches when server render is enough.

## Cache policy

MUST explicitly decide what is cacheable.

Generally cacheable:

- venue metadata;
- static content;
- public marketing content.

Generally not blindly cacheable:

- live queue;
- current user;
- permissions;
- dashboard operational state.

## Frontend tests

Use:

- component tests for critical UI logic;
- E2E tests for critical user flows;
- accessibility smoke tests for public forms and dashboard modals;
- contract tests at API boundary when possible.

## v3 frontend gate

A frontend feature MUST answer:

- What is server state and what is client state?
- Which components are server components and why?
- Which components require `use client` and why?
- What are loading, empty, error and success states?
- Is the form accessible and keyboard usable?
- Is backend validation still authoritative?
- Does the feature add unnecessary bundle/hydration cost?

MUST NOT make a whole route a Client Component because one child needs interactivity. Extract the interactive child.
