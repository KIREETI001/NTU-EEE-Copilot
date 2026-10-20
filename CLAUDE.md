# CLAUDE.md — Operating Manual

> Read this first, every session. It tells you (and future-you, and Claude Code)
> how this repo is structured, what the rules are, and how not to break the one
> thing that matters: **trustworthy academic data**.

---

## What this is

An **Academic & Career Co-Pilot** for NTU students. Pilot = NTU EEE. It parses a
student's standing against graduation/specialization rules, simulates CGPA under
NTU's FGO scheme, and maps specializations to careers. Designed to expand to other
NTU courses, then other Singapore universities — but **only EEE is real right now.**

Two product tracks, deliberately separated by liability:

| Track | Audience | Liability | Status |
|---|---|---|---|
| **Explorer** (`apps/explorer`) | Prospective students + undergrads researching | Low (read-only browsing) | ✅ builds, shippable as public v1 |
| **Optimizer** (engine + future UI) | Logged-in undergrads simulating their own CGPA/FGO | **High** (irreversible-action advice) | ✅ engine proven; UI not built |

The strategic call: **ship the Explorer publicly while the Optimizer hardens privately.**

---

## The one rule that matters

**You never let the app state an academic fact the rulebook can't vouch for.**

- The `rulebook/` YAML is the **single source of truth**. Code reads it; code never hardcodes a cap, a grade scale, or a course code.
- Git history **is** the changelog (NTU publishes none). Every rulebook change is a reviewed commit.
- Every data field carries a `confidence` tag (`verified` / `outdated` / `unverified`) that the UI surfaces as a badge. Never silently upgrade confidence.
- FGO is **irreversible**. Any FGO output must carry the irreversibility warning and the "verify with Office of Academic Services" disclaimer. The engine enforces this; don't route around it.

---

## Repo map

```
ntu-copilot/
├── CLAUDE.md                  ← you are here
├── README.md                  ← human onboarding + run commands
├── VERSIONING.md              ← how cohorts + rulebook versions are tracked
├── package.json               ← npm workspaces root; top-level scripts
├── scripts/
│   └── build-rulebook.mjs     ← compiles rulebook/**/*.yaml → explorer/public/rulebook.json
├── rulebook/                  ← SOURCE OF TRUTH (human-edited, version-controlled)
│   └── ntu/eee/ay2025-26/
│       ├── meta.yaml          ← cohort metadata, sources, audit status, caveats
│       ├── degree.yaml        ← AU structure, candidature, key courses
│       ├── grading.yaml       ← ⚠ GPA scale, FGO rules, honours (liability-critical)
│       ├── specializations.yaml ← 8 tracks + recognition rules
│       ├── admissions.yaml     ← IGP, fees, scholarships
│       └── careers.yaml        ← GES data + specialization→career map
├── services/engine/           ← Python rule engine (the correctness core)
│   ├── app/
│   │   ├── models.py          ← Pydantic domain models
│   │   ├── rulebook.py        ← YAML loader (only place that does I/O)
│   │   ├── main.py            ← FastAPI surface (thin)
│   │   └── engine/            ← PURE functions: cgpa, fgo, specialization, honours
│   └── tests/                 ← 20 tests, run against the REAL rulebook
└── apps/explorer/             ← Next.js 15 public site (Handbook design)
    ├── app/                   ← home, specializations/[slug], admissions, suggest
    ├── components/
    ├── lib/rulebook.ts        ← typed reader over rulebook.json
    └── public/rulebook.json   ← GENERATED — do not hand-edit
```

---

## Run commands

```bash
# from repo root
npm install                       # installs workspace deps (root + explorer)

npm run rulebook:build            # YAML → public/rulebook.json  (run after ANY rulebook edit)
npm run explorer:dev              # Next.js dev server on :3000
npm run explorer:build            # rebuilds rulebook THEN builds explorer

# engine (Python)
cd services/engine
pip install -r requirements.txt --break-system-packages   # or use a venv
python -m pytest                  # 20 tests; MUST pass before any rulebook change ships
uvicorn app.main:app --reload --port 8000   # engine API on :8000
```

---

## How to make changes safely

**Editing rulebook data (most common task):**
1. Edit the YAML in `rulebook/ntu/eee/ay2025-26/`.
2. Update its `confidence` and `meta.yaml → status.last_full_review` honestly.
3. `npm run rulebook:build` to regenerate the JSON.
4. `cd services/engine && python -m pytest` — tests run against the real rulebook, so a value that breaks an invariant fails here.
5. Commit. The commit message **is** the changelog entry (see VERSIONING.md).

**Adding a new cohort (e.g. ay2026-27):**
1. Copy the `ay2025-26/` folder to `ay2026-27/`, edit values, set the FGO regime branch.
2. The loader (`rulebook.py`) and JSON builder discover it automatically.
3. Add it to the cohort picker in the UI (not yet built).

**Touching the engine math:**
- Keep engine functions **pure** (no I/O). I/O belongs in `rulebook.py` / `main.py`.
- Add a golden test first. The CGPA oracle in `tests/test_cgpa.py` should eventually hold the real Degree Audit numbers (CGPA target: 3.74).

---

## Build order (the layered plan — where we are)

1. ✅ **Rulebook spine** — versioned YAML, AY2025-26 EEE, full provenance.
2. ✅ **Rule engine + tests** — CGPA / FGO / specialization / honours, 20/20 green.
3. ✅ **Explorer** — public, low-liability v1 with specialization browse + career map + **suggestion interface**.
4. ⬜ **Optimizer UI** — logged-in undergrad CGPA/FGO simulator over the engine API (HIGH liability — build last, behind auth, with loud disclaimers).

Cross-cutting, not yet built:
- ⬜ **Ad-hoc scraper** — re-fetches `meta.yaml → sources`, extracts STRUCTURED values, opens a PR with a diff. Never auto-merges.
- ⬜ **Monthly auditor** — scheduled scraper run; diffs extracted values (not raw HTML, to avoid false positives from NTU's reflows); updates `status.next_audit_due`; flags drift.
- ⬜ **Transcript parser** — deferred on purpose. NTU audit layouts vary; structured paste / manual entry is more robust for v1. Add once the engine is bulletproof and the format is pinned.

---

## Known issues / next actions

- **SECURITY:** `next@15.1.3` has CVE-2025-66478. Bump to the latest patched 15.x before any public deploy (`npm install next@latest --workspace apps/explorer`), then re-run `explorer:build`.
- **Data caveats** carried from research (also in `meta.yaml → open_caveats`): total degree AU is 136 by category sum (older sheets say 137 — confirm against the intranet AU Summary PDF); Biomedical Electronics track is `unverified` (partly AY2024/25 data); some EE6xxx electives are TBC; S1/S2 availability is soft.
- **Suggestion routing:** set `NEXT_PUBLIC_REPO=owner/name` in `apps/explorer/.env.local` so the suggest form files GitHub issues; otherwise it falls back to mailto.

---

## Design language (Explorer)

Handbook: a well-set student handbook. Cool paper (`--canvas`), ink text, one deep-teal
accent; green / amber / red are reserved for data confidence and warnings. Source Serif 4
for headings and track names, IBM Plex Sans (tabular numerals) for everything else; no
monospace labels, no uppercase tracked eyebrows, sentence-case copy. The one bold element
is the home page's typeset index of specializations. Colours are CSS variables in
`apps/explorer/app/globals.css` (light + dark), mapped to Tailwind names in
`tailwind.config.ts` (`ember` = the accent, `bone` = ink, `ash` = muted, kept for history).
