# Poza Nutą — Open Questions

These must be answered to finalize implementation decisions.

## Product

1. How many concurrent public viewers per active event are expected?
2. Are public participants anonymous forever, or will accounts appear later?
3. Does submission require email/phone, or only display name?
4. Can one participant submit multiple songs?
5. Does operator need moderation queue before public visibility?
6. Is queue history immutable?
7. Can events repeat/recurring events exist?
8. Are there paid features or payments?
9. Are notifications email/SMS/push required?
10. Is multi-language needed beyond Polish?

## Security/privacy

1. Retention period for queue submissions?
2. Right-to-delete/anonymization behavior?
3. Who can see historical participant names?
4. Are audit logs immutable and how long retained?
5. What is platform owner bootstrap/removal process?

## Technical

1. Exact Better Auth + Fastify integration pattern?
2. Drizzle migration workflow and production migration runner?
3. SSE fanout path when Railway scales to multiple instances?
4. Is Redis needed later or can Postgres LISTEN/NOTIFY suffice?
5. Where are emails sent from and through which provider?
6. What is the final catalog import provider strategy?
7. Do imports require Apify/Crawlee or direct APIs/scrapers?
