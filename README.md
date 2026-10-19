# NTU Academic & Career Co-Pilot

An intelligent academic-to-career co-pilot for NTU students. **Pilot cohort: EEE.**
It checks a student's standing against graduation and specialization rules,
simulates CGPA under NTU's (irreversible) Flexible Grading Option, and maps
specializations to real career outcomes — all anchored to a **version-tracked
rulebook**, not scraped-on-the-fly data.

> ⚠ Not an official NTU tool. Every figure is reconstructed from public NTU
> sources and carries a confidence badge. Always confirm with the NTU Office of
> Academic Services before acting — especially on FGO, which is irreversible.

## Why it's built this way

NTU publishes no changelog for curriculum rules. So the rules live as
**version-controlled YAML** (`rulebook/`), and **Git history is the changelog**.
A scraper (planned) only ever proposes diffs as pull requests for human review —
it never auto-updates live data. This is what makes the advice defensible.

## Architecture

| Layer | Path | Stack | Role |
|---|---|---|---|
| Rulebook | `rulebook/` | YAML | Source of truth, per cohort, with provenance + confidence |
| Engine | `services/engine/` | Python · FastAPI · Pydantic | Pure, tested CGPA / FGO / specialization / honours math |
| Explorer | `apps/explorer/` | Next.js 15 · React 19 · Tailwind | Public site: browse specializations, careers, admissions; suggest fixes |
| Compiler | `scripts/build-rulebook.mjs` | Node | YAML → `explorer/public/rulebook.json` |

Two product tracks, split by liability: the **Explorer** (low-liability, public)
ships first; the undergrad **Optimizer** (high-liability, logged-in CGPA/FGO
simulator) hardens privately over the same engine. See `CLAUDE.md` for the full plan.

## Quickstart

```bash
npm install                 # workspace deps

npm run rulebook:build      # compile YAML → JSON
npm run explorer:dev        # → http://localhost:3000

# engine
cd services/engine
pip install -r requirements.txt --break-system-packages
python -m pytest            # 20 tests, run against the real rulebook
uvicorn app.main:app --reload --port 8000   # → http://localhost:8000/docs
```

## Status

- ✅ Rulebook spine (AY2025-26 EEE, full provenance)
- ✅ Rule engine + 20 passing tests
- ✅ Explorer (8 specialization pages, admissions, suggestion interface) — builds clean
- ✅ Optimizer UI (FGO & CGPA, degree-audit upload) and specialization eligibility page — needs the engine running
- ⬜ Scraper · monthly auditor · public deployment (see `CLAUDE.md`)

## Security

`next@15.1.3` ships with CVE-2025-66478 — bump before any public deploy:
`npm install next@latest --workspace apps/explorer && npm run explorer:build`.

See **`CLAUDE.md`** for the operating manual and **`VERSIONING.md`** for how cohorts
and rulebook versions are tracked.
