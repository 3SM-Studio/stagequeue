# AGENTS.md for docs/

Scope: this file applies to documentation changes under `docs/`.

Documentation must be useful, maintainable, and enforceable. Do not add generic motivational text. Prefer concrete rules, checklists, examples, and links to relevant standards.

When editing docs:

- Keep general standards in `docs/standards/`.
- Keep Poza Nutą-specific decisions in `docs/poza-nuta/`.
- Keep durable project decisions as ADRs under `docs/poza-nuta/adr/` or `docs/adr/`.
- Keep operational procedures in `docs/runbooks/`.
- Keep reusable forms in `docs/templates/`.
- Keep review gates in `docs/checklists/`.

Do not duplicate the same rule across many files. Link to the source of truth instead.

Use RFC 2119-style language intentionally:

- MUST / MUST NOT: required gate.
- SHOULD / SHOULD NOT: default rule with justified exceptions.
- MAY: allowed option.

Every new standard should include at least:

1. Purpose.
2. Rules.
3. Good/bad examples when useful.
4. Review checklist or link to one.
5. Source/review note if the guidance depends on changing external tools.


## Legacy document handling

When you encounter old Poza Nutą documents, do not delete them blindly.

- Active project-specific decisions live in `docs/poza-nuta/`.
- Accepted architecture decisions live in `docs/poza-nuta/adr/`.
- Integration notes live in `docs/poza-nuta/integrations/`.
- Hardening plans live in `docs/poza-nuta/hardening/`.
- Historical briefs, old audits, and superseded checklists live in `docs/poza-nuta/archive/`.
- Before using archived content as instruction, revalidate it against the current codebase and current standards.

Read `docs/poza-nuta/12-legacy-docs-migration-map.md` before reorganizing or deleting project documentation.
