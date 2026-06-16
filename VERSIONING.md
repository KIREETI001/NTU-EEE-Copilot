# Versioning & Change Tracking

NTU publishes no official changelog for curriculum, grading, or specialization
rules. This repo manufactures one. Three layers of versioning work together.

## 1. Rulebook schema version

`meta.yaml → schema_version` (semver). Bump when the **shape** of the YAML changes
(a new field, a renamed key), not when values change. The engine and the JSON
compiler can branch on this if a migration is ever needed.

## 2. Cohort versioning

Rules differ by the academic year a student is bound to. Each cohort is a folder:

```
rulebook/<university>/<programme>/<academic-year>/
        e.g. rulebook/ntu/eee/ay2025-26/
```

- **Never edit one cohort's values to reflect another's.** Copy the folder forward.
- The single most dangerous boundary is `meta.yaml → cohort.fgo_regime` /
  `fgo_regime_effective`. FGO rules changed at AY2025-26 Sem 2 (the "Expanded FGO").
  A student mid-degree may straddle regimes — keep them in separate cohort files and
  let the UI pick the right one.
- The loader (`services/engine/app/rulebook.py`) and the compiler
  (`scripts/build-rulebook.mjs`) **auto-discover** every cohort folder. No code edit
  needed to add `ay2026-27`.

## 3. Field-level provenance + confidence

Every data file carries, per value or per block:

- `confidence`: `verified` | `outdated` | `unverified` — surfaced in the UI as a badge.
- `meta.yaml → sources`: the canonical URL + format the value came from (drives the
  future scraper/auditor).
- `meta.yaml → status`: `last_full_review`, `reviewed_by`, `next_audit_due`,
  `overall_confidence`, and `open_caveats` (known soft spots).

**Rule:** never raise a `confidence` level without a current official source in hand.

## Commit message = changelog entry

Because Git history is the changelog, write rulebook commits so they read as one:

```
rulebook(eee/ay2025-26): correct EE6405 title + mark DA&ML technical electives verified

Source: NTU course catalogue (wis.ntu.edu.sg), checked 2026-06-16.
Confidence: unverified → verified for 4 fields.
```

Format: `rulebook(<programme>/<cohort>): <what changed>` then **source + date** and
**confidence transitions** in the body. A reader scanning `git log -- rulebook/`
should see exactly what changed, when, from which source, and how trusted it now is.

## The auditor (planned)

A scheduled job re-fetches each `meta.yaml → sources` URL, extracts the **structured
value** (not raw HTML — NTU reflows pages, which would cause false positives), diffs
it against the rulebook, and opens a **PR** when something drifts. It updates
`status.next_audit_due` and never auto-merges. A human vouches for every change.
