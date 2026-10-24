# Enhancement Dossier — 2026-07-06

> "Everything you need to enhance this project," grounded in the real code, the
> live external data sources, and one working auditor run. Every claim below was
> verified this session — file paths, API schemas, and scrapeability are checked,
> not assumed. Ordered by leverage. The **one rule** (never state a fact the
> rulebook can't vouch for) constrains every item.

---

## 0. What was verified this session

| Claim | How verified | Result |
|---|---|---|
| `careers.yaml` GES numbers | Live data.gov.sg `datastore_search` | ✅ 2024 NTU EEE row (`employment_rate_overall 79.3`, `gross median 4800`) matches the rulebook **byte-for-byte** |
| GES coverage | API, sorted | Years **2020–2024** present; **2024 is the API's latest** |
| The rulebook's 2025 row | Cross-check | Comes from the **MOE GES PDF**, which leads data.gov.sg by ~1 cycle — a *feature* of the trust model, not an error |
| Intake dataset (`d_6b26…`) | API schema | **Coarse**: faculty-cluster × sex, **not** per-programme — weaker than earlier claimed; use only for context |
| EEE curriculum page | Fetched + inspected | Server-rendered but **prose bullets, no course codes, no tables, no PDF links** — a poor value-scrape target |
| Multi-school readiness | Repo map | Loader/build/validate are **fully glob-based**; only **3 hardcoded defaults** block a clean second school |
| Handbook freshness | Live HTTP HEAD | ⚠️ **Drift found** — see §1 |

---

## 1. Shipped in this pass — GES automation + the monthly auditor

The auditor `meta.yaml` has always named (`scripts/audit.mjs — to be built`) now exists, plus the GES generator I offered last turn. **New files (all additive, zero changes to engine/explorer):**

```
scripts/audit.mjs              # orchestrator: walks every cohort, reports drift, proposes next_audit_due
scripts/audit/datagovsg.mjs    # data.gov.sg datastore_search client (optional DATA_GOV_SG_API_KEY)
scripts/audit/ges.mjs          # GES → careers.yaml series: pure map + diff, impure fetch, YAML emit
scripts/audit/freshness.mjs    # HTTP Last-Modified vs source_date freshness signal
scripts/audit/ges.test.mjs     # 7 golden tests (node --test), fixtures from the real API
```

New npm scripts: `rulebook:audit`, `audit:test`.

```bash
npm run rulebook:audit                              # audit all cohorts (exit 1 on actionable drift)
npm run rulebook:audit -- --cohort ntu/eee/ay2025-26
npm run rulebook:audit -- --emit                    # print paste-ready careers.yaml series from the API
npm run rulebook:audit -- --degree "Mechanical Engineering"  # generate for ANY NTU programme
npm run audit:test                                  # 7/7 green
```

**Design fidelity to the one rule:** the auditor **never writes the rulebook**. It reports, diffs structured values (not raw HTML), and with `--emit` prints a block a human reviews and commits. Git stays the changelog.

**The auditor's first real finding (act on this):**

> `academic_handbook` **changed** — the PDF's `Last-Modified` is **Tue 19 May 2026**, but `meta.yaml` records `source_date: 2026-05-11`. The **grading/FGO source was revised 8 days after the recorded date and nobody re-checked.** Because `grading.yaml` is the single highest-liability file, this is the #1 action below.

**A trust win to record:** the GES cross-check *passed* — automation now proves `careers.yaml`'s employment/salary figures against the government source on every run.

---

## 2. Tier 0 — Trust actions before going public (highest priority)

| # | Action | Files | Why |
|---|---|---|---|
| 0.1 | **Re-verify `grading.yaml` against the 19-May-2026 handbook.** Download the PDF, diff FGO/GPA/honours against what's stored, update `meta.yaml → sources.academic_handbook.source_date` + `status.last_full_review`. | `rulebook/ntu/eee/ay2025-26/grading.yaml`, `meta.yaml` | Liability-critical; auditor flagged real drift |
| 0.2 | **Add `source_date` to `curriculum_page`, `indicative_grade_profile`, `tuition_fees`.** They report `unknown` today purely because there's nothing to compare Last-Modified against. | `meta.yaml → sources.*` | Turns 3 more sources from "unknown" into a working freshness bell — 10-minute win |
| 0.3 | **Resolve or badge remaining caveats:** Biomedical Electronics still `unverified`; TBC EE6xxx electives. | `specializations.yaml`, `meta.yaml → open_caveats` | The public "trust gate" in CLAUDE.md step 6 |
| 0.4 | **Schedule the auditor** (§3.1) so drift like 0.1 is caught monthly, not by luck. | `.github/workflows/` | Makes the freshness guarantee real |

---

## 3. Tier 1 — Finish the data-freshness automation

### 3.1 Schedule the auditor (small, high value)
Add a **scheduled GitHub Action** (`cron: monthly`) that runs `npm run rulebook:audit`. On exit 1, open an **issue** (or draft PR) titled "Rulebook drift detected — review". Add the free `DATA_GOV_SG_API_KEY` as a repo secret for a higher rate limit (optional; the public tier works). This closes the ⬜ "Monthly auditor" item in CLAUDE.md — the code is done; only the workflow YAML remains.

### 3.2 Per-source extractor roadmap (grounded in real scrapeability)

| Source | Freshness today | Structured extraction | Verdict |
|---|---|---|---|
| `graduate_employment_survey` | ✅ API diff | ✅ **Done** | Shipped |
| `academic_handbook` (PDF) | ✅ Last-Modified is a reliable bell | 🟡 Parse FGO/GPA/honours tables — **reuse the engine's existing `pdfplumber`** (`services/engine/app/parser/`) | Build next; liability-critical, so extract → propose diff → human commits |
| `curriculum_page` (HTML) | 🟡 has Last-Modified but CMS reflows | 🔴 **prose, no course codes** — do **not** build a value extractor | Freshness bell only |
| `course_catalogue` (OWA) | 🔴 no Last-Modified header | 🟡 content-hash diff of the rendered course list | Use a hash snapshot, not header check |
| `indicative_grade_profile` (PDF) | ✅ after 0.2 | 🟡 parse IGP table | Medium |
| `tuition_fees` (HTML+PDF) | ✅ after 0.2 | 🟡 parse fee table | Medium |
| `area_specialization*` (gated) | ⛔ unwatchable | ⛔ manual | Stays manual — respected in code |

### 3.3 Make `freshness.mjs` smarter (optional)
Persist ETag/Last-Modified snapshots to a small committed JSON (`scripts/audit/.snapshots.json`) so the auditor detects change **since the last run** even where `source_date` is absent, and so OWA (no Last-Modified) gets a content-hash diff. Keep it committed → the snapshot history is itself a changelog.

---

## 4. Tier 2 — Multi-school / multi-programme scaling

**The infrastructure is ready.** `rulebook.py`, `build-rulebook.mjs`, `validate-rulebook.mjs` all discover cohorts by walking `rulebook/<uni>/<prog>/<cohort>/`. Adding a school = drop a folder + rebuild. The blockers are small and known.

### 4.1 The 3 hardcoded defaults (exact, ready to parameterize)
Env-var-with-same-default = **zero behavior change**, just unlocks per-deployment override:

| File:line | Now | Change |
|---|---|---|
| `services/engine/app/main.py:85-86` (`CohortRef`) | `programme="eee"`, `cohort="ay2025-26"` | `os.getenv("DEFAULT_PROGRAMME","eee")`, `…("DEFAULT_COHORT","ay2025-26")` |
| `services/engine/app/main.py:206-207` (parse-audit params) | same | same |
| `services/engine/app/parser/__main__.py:20` | `load_cohort("ntu","eee","ay2025-26")` | add a `--cohort uni/prog/cohort` CLI arg |
| `apps/explorer/lib/rulebook.ts:25` | `DEFAULT_COHORT = "ntu/eee/ay2025-26"` | `process.env.NEXT_PUBLIC_DEFAULT_COHORT ?? "ntu/eee/ay2025-26"` |

### 4.2 Cohort picker (new UI)
There is no cohort switcher. For >1 cohort, add one reading `Object.keys(rulebook.json.cohorts)`. Small Next component + `ACTIVE_COHORT` becomes state. Needed before any second cohort is user-visible.

### 4.3 Shared university-level constants — the biggest authoring win
`grading.yaml` (GPA scale, **FGO**, honours) is **university-wide**, not programme-specific. Today it would be copy-pasted per school. Proposal:

```
rulebook/ntu/_shared/ay2025-26/grading.yaml   # authored once
rulebook/ntu/eee/ay2025-26/grading.yaml       # optional override (e.g. FGO regime branch)
```

Loader merges `_shared` under the cohort (cohort wins on conflict), in **both** `build-rulebook.mjs` and `rulebook.py`. **Caution:** confirm honours/FGO are genuinely identical across schools before dedup — keep the override path for the ones that differ. This removes the single largest per-school cost and eliminates a whole class of "grading drift between schools" bugs.

### 4.4 What actually remains manual per programme
- `careers.yaml` → **free** now (`--degree "<programme>"` generates it).
- `admissions.yaml` → IGP + fees are **university-wide single tables** (one scrape covers all); only per-programme cutoff rows differ.
- `grading.yaml` → **shared** (4.3).
- `degree.yaml` + `specializations.yaml` → **genuinely per-programme**, sourced from the **handbook PDF + area-spec PDF + OWA** (NOT the marketing curriculum page — verified too thin). This is the real marginal cost of a new school: ~2 files, human-curated.

**Rollout order:** EEE → a second CoE programme (Computer/Mechanical, reuse the handbook) → CoS/CCDS/NBS.

---

## 5. Tier 3 — Product enhancements (reuse the engine you already have)

These fit the maintainer's Data-Analysis/ML lean and reuse existing endpoints.

| Feature | What | Engine reuse | Liability |
|---|---|---|---|
| **Specialization recommender** | Given a parsed audit, rank the 8 tracks by AU-already-completed toward each × GES-informed career fit. A genuine scoring/ranking (DA/ML-flavored) surface. | `/specialization/plan` already returns `remaining_needed`; add a ranking layer | Low-med (advisory) |
| **Honours/CGPA trajectory solver** | "To reach Distinction you need ≥ X CGPA over your remaining Y AU." Inverts the honours bands. | `/honours` + `/cgpa`; add a solver fn | **High** (carry FGO irreversibility + OAS disclaimer) |
| **GES trend on specialization pages** | Sparkline of `gross_median_sgd` by year per programme — the series is now clean and machine-fed. | `careers.yaml` series (already there) | Low |
| **Cohort/AY comparison** | Diff two cohorts' rules side-by-side once multi-cohort lands. | rulebook.json multi-cohort | Low |

All high-liability compute stays behind the BFF proxy + auth, per the existing architecture.

---

## 6. Tier 4 — Ship it

Security posture is already strong (BFF proxy, SSRF allowlist `optimizer-proxy.ts`, `x-internal-secret` gate, PDPA no-logging grep). Per CLAUDE.md "Resume checklist", the **only real blocker is provisioning Supabase**; everything else is env wiring. Sequence: Supabase → Fly + Vercel hosts → env → flip `DEPLOY_ENABLED=true` → verify 401 gates → resolve Tier-0 trust caveats → public.

---

## 7. Prioritized backlog (recommended order)

1. **0.1** Re-verify `grading.yaml` vs the 19-May handbook *(liability; auditor-flagged)*
2. **0.2** Add `source_date` to 3 sources *(10-min win, unlocks freshness)*
3. **3.1** Schedule the auditor in CI *(closes the "monthly auditor" ⬜)*
4. **4.1** Parameterize the 3 hardcoded defaults *(zero-risk, unblocks scaling)*
5. **4.3** Shared `_shared/grading.yaml` inheritance *(biggest authoring win)*
6. **3.2** Handbook PDF extractor via existing pdfplumber *(next automation)*
7. **5** Specialization recommender *(headline product feature)*
8. **4.2 / 4.4** Second programme end-to-end *(proves scaling)*
9. **6** Deploy

---

## Appendix — verified reference facts

- **GES dataset:** `d_3c55210de27fcccda2ed0c63fdd2b352` · columns `year, university, school, degree, employment_rate_overall, employment_rate_ft_perm, basic_monthly_{mean,median}, gross_monthly_{mean,median}, gross_mthly_{25,75}_percentile` (all string values) · 1550 rows · latest year 2024.
- **Field map → `careers.yaml`:** `employment_rate_overall→currently_employed_pct`, `employment_rate_ft_perm→full_time_permanent_pct`, `gross_monthly_median→gross_median_sgd`, `gross_monthly_mean→gross_mean_sgd`, `gross_mthly_25_percentile→gross_p25_sgd`, `gross_mthly_75_percentile→gross_p75_sgd`, `basic_monthly_median→basic_median_sgd`. `basic_monthly_mean` unused; `secured_employment_pct` has no API column (PDF-only) and is never synthesized.
- **Intake dataset:** `d_6b264092cd066c55d8e2db9e68e7ffdb` — `year, sex, course, intake, enrolment, graduates`; coarse clusters, not per-programme.
- **Hardcoded cohort spots:** `main.py:85-86`, `main.py:206-207`, `parser/__main__.py:20`, `rulebook.ts:25`.
- **CI guards (unaffected by this pass):** deterministic `rulebook.json`; no grading numbers in `apps/explorer/**.tsx`; no `print`/`logging` on the engine request path.
