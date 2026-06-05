# Poza Nutą legacy docs migration map

This file maps the previously loose `docs/` files into the v5 documentation structure.

## Migration rule

Do **not** delete legacy project knowledge blindly. Move it into the correct project-specific location, then decide whether it is active, superseded, or archived.

## Imported legacy documents

| Previous file | New location | Status | Rule |
|---|---|---:|---|
| `docs/adr/ADR-001...ADR-012` | `docs/poza-nuta/adr/` | Active historical decisions | Keep. ADRs are project history and must not be rewritten silently. |
| `POZA_NUTA_CODEX_BRIEF.md` | `docs/poza-nuta/archive/poza-nuta-codex-brief.md` | Archived | Historical Codex brief. Use current `AGENTS.md` and standards first. |
| `POZA_NUTA_CODEX_BRIEF_UPDATED.md` | `docs/poza-nuta/archive/poza-nuta-codex-brief-updated.md` | Archived | Historical Codex brief. Current agent instructions live in root `AGENTS.md`. |
| `POZA_NUTA_IMPLEMENTATION_CHECKLIST.md` | `docs/poza-nuta/archive/poza-nuta-implementation-checklist.md` | Archived | Historical checklist. Current work gates live in `docs/checklists/` and `docs/poza-nuta/09-v3-quality-gates.md`. |
| `POZA_NUTA_IMPLEMENTATION_CHECKLIST_UPDATED.md` | `docs/poza-nuta/archive/poza-nuta-implementation-checklist-updated.md` | Archived | Historical checklist. Do not use as the primary source of truth. |
| `POZA_NUTA_LINE_BY_LINE_AUDIT.md` | `docs/poza-nuta/archive/poza-nuta-line-by-line-audit.md` | Archived audit | Keep for traceability. Do not treat old findings as current unless revalidated. |
| `POZA_NUTA_TYPECHECK_AND_REPO_CLEANUP_BRIEF.md` | `docs/poza-nuta/archive/poza-nuta-typecheck-and-repo-cleanup-brief.md` | Archived brief | Keep for history. Convert active findings into issues/checklists before executing. |
| `ISING_DATA_ACCESS_POLICY.md` | `docs/poza-nuta/integrations/ising-data-access-policy.md` | Active integration note until superseded | Keep separate from general standards. |
| `ISING_PERMISSION.md` | `docs/poza-nuta/integrations/ising-permission.md` | Active integration note until superseded | Keep separate from general standards. |
| `PHASE_11_HARDENING_CHECKLIST.md` | `docs/poza-nuta/hardening/phase-11-hardening-checklist.md` | Project hardening checklist | Use only if still aligned with current roadmap. Otherwise archive after review. |

## Source-of-truth order

When documents conflict, use this order:

1. Current task instructions and repository state.
2. Root `AGENTS.md`.
3. `docs/standards/` for general engineering standards.
4. `docs/poza-nuta/` for project-specific rules.
5. `docs/poza-nuta/adr/` for accepted project decisions.
6. `docs/checklists/` for PR/release/security execution gates.
7. `docs/poza-nuta/integrations/` for integration-specific notes.
8. `docs/poza-nuta/hardening/` for hardening work plans.
9. `docs/poza-nuta/archive/` for historical material only.

## Required follow-up after migration

After copying this package into the repository:

- Update any links that still point to old `docs/*.md` files.
- Add a short note to the repository `README.md` linking to `docs/standards/00-index.md` and root `AGENTS.md`.
- Review archived checklists and convert active items into issues or current checklists.
- Do not execute old audit instructions without revalidating them against the current codebase.
