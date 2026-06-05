# Migration install guide

Use this package as a safe documentation migration, not as a blind replacement.

## Recommended branch

```bash
git checkout -b docs/senior-standard-v5
```

## Copy strategy

Copy these from the package root into the repository root:

```txt
AGENTS.md
.github/
docs/
README.md
MANIFEST.md
```

If the repository already has `.github/workflows/*`, do not overwrite working CI. Keep `ci.example.yml` as a reference and merge manually.

## Legacy docs

The uploaded legacy docs have already been placed into:

```txt
docs/poza-nuta/adr/
docs/poza-nuta/archive/
docs/poza-nuta/integrations/
docs/poza-nuta/hardening/
```

After copying v5, old loose files such as `docs/POZA_NUTA_CODEX_BRIEF.md` should no longer remain at the top level. Move them with `git mv`, do not delete them directly.

## Suggested git moves for an existing repo

```bash
mkdir -p docs/poza-nuta/archive docs/poza-nuta/integrations docs/poza-nuta/hardening

git mv docs/adr docs/poza-nuta/adr || true
git mv docs/POZA_NUTA_CODEX_BRIEF.md docs/poza-nuta/archive/poza-nuta-codex-brief.md || true
git mv docs/POZA_NUTA_CODEX_BRIEF_UPDATED.md docs/poza-nuta/archive/poza-nuta-codex-brief-updated.md || true
git mv docs/POZA_NUTA_IMPLEMENTATION_CHECKLIST.md docs/poza-nuta/archive/poza-nuta-implementation-checklist.md || true
git mv docs/POZA_NUTA_IMPLEMENTATION_CHECKLIST_UPDATED.md docs/poza-nuta/archive/poza-nuta-implementation-checklist-updated.md || true
git mv docs/POZA_NUTA_LINE_BY_LINE_AUDIT.md docs/poza-nuta/archive/poza-nuta-line-by-line-audit.md || true
git mv docs/POZA_NUTA_TYPECHECK_AND_REPO_CLEANUP_BRIEF.md docs/poza-nuta/archive/poza-nuta-typecheck-and-repo-cleanup-brief.md || true
git mv docs/ISING_DATA_ACCESS_POLICY.md docs/poza-nuta/integrations/ising-data-access-policy.md || true
git mv docs/ISING_PERMISSION.md docs/poza-nuta/integrations/ising-permission.md || true
git mv docs/PHASE_11_HARDENING_CHECKLIST.md docs/poza-nuta/hardening/phase-11-hardening-checklist.md || true
```

Then copy the new/updated standard files from this package and review conflicts.

## Validation

Before committing:

```bash
find docs -type f -name "*.md" -empty -print
git status --short
```

Commit:

```bash
git add .
git commit -m "docs: add senior engineering standards and migrate project docs"
```
