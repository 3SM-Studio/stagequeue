# 17 — Accessibility, i18n and UX Quality

## Accessibility baseline

Frontend work MUST consider:

- semantic HTML;
- labels for form controls;
- keyboard navigation;
- visible focus;
- modal focus trap/restore;
- sufficient contrast;
- error messages connected to inputs;
- no critical action requiring mouse only;
- reduced motion where applicable.

ARIA is not a replacement for semantic HTML. Use native elements first.

## Public forms

Public forms MUST be usable:

- on mobile;
- with keyboard;
- with screen readers where practical;
- with clear validation errors;
- under slow network.

## Dashboard UX

Dashboard must make operational state obvious:

- active/paused/closed/archived status;
- destructive action confirmation;
- optimistic UI only when rollback is handled;
- permission denied states;
- clear loading/error states.

## Internationalization and localization

Even a Polish-first product needs explicit date/time policy.

MUST decide:

- locale;
- timezone source;
- date formatting;
- pluralization;
- translated validation messages;
- public vs dashboard language.

## Timezone policy

Store timestamps in UTC. Display event times in explicit venue or user timezone.

MUST NOT render event time without timezone context when ambiguity affects users.

## UX copy

Error messages should be:

- safe;
- actionable;
- not leaking sensitive state;
- consistent.

Bad:

```txt
Something went wrong.
```

Better:

```txt
Nie możesz dołączyć do tej kolejki, bo wydarzenie nie jest aktywne.
```

But for security-sensitive public lookup, it may be correct to return generic 404.
