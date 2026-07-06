# Course-Offering Data Foundation — Design Spec

**Date:** 2026-07-06
**Status:** Approved (brainstormed 2026-07-06). Foundation for NTU-wide expansion + the STARS timetable planner.
**Scope:** the shared *data foundation* only. The clash engine, planner UI, STARS export UX, live vacancies, and per-programme rulebook authoring are explicitly out (each its own later spec).

---

## 1. The core principle — two data planes

The product's trust model (every academic fact is human-vouched, version-controlled, Git = changelog) works because academic *rules* move slowly. STARS *operations* (which courses run, their indexes, weekly timeslots) move fast and are volatile. Forcing the fast data into the version-controlled rulebook would quietly break the "every value is defensible" invariant.

So the two are kept on separate planes, physically separated on disk:

| Plane | Contains | Trust model | Lives in |
|---|---|---|---|
| **Rulebook** (exists) | Slow academic rules: degree / grading / specializations / admissions / careers | Human-vouched, version-controlled | `rulebook/` |
| **Catalogue** (new) | `code → {title, au?, school?}` — the shared course vocabulary | Reviewable reference; regenerated, committed | `catalogue/` |
| **Offering** (new) | Per-semester indexes + weekly slots | Machine-sourced, `fetched_at`-stamped, "as-of / confirm in STARS" | `offerings/` |

`catalogue/` and `offerings/` sit **outside** `rulebook/`, so the rulebook validator and monthly auditor keep treating the rulebook as the sole human-vouched source. The catalogue also lets `validate-rulebook.mjs`'s course-title consistency check graduate from self-consistency to a cross-check against a real table.

## 2. Data model (clash-computable by construction)

**Catalogue** — `catalogue/ntu/ay2025-26/courses.json`:
```jsonc
{ "generated_from": "ntumods:code-title", "academic_year": "2025-26",
  "courses": { "EE2010": { "title": "Signals and Systems", "au": null, "school": null } } }
```

**Offering snapshot** — `offerings/ntu/2025-26-s2/EE2010.json`:
```jsonc
{ "course": "EE2010", "academic_year": "2025-26", "semester": 2,
  "fetched_at": "2026-07-06T09:00:00Z", "source": "owa:aus_schedule",
  "indexes": [
    { "index": "10112", "remark": null,
      "slots": [
        { "type": "LEC", "group": "1", "day": "MON",
          "start": "0930", "end": "1120", "venue": "LT1A", "weeks": "1-13" } ] } ] }
```
`day + start + end + weeks` is exactly what a downstream clash-detector needs. Slot `type ∈ {LEC,TUT,LAB,SEM,DES,PRJ,WKSHOP}`. Times are 24h `HHMM` strings. **Vacancies are deliberately omitted** (planning-grade decision); an optional `vacancy_seen:{count,at}` may be added later, always UI-labelled "indicative."

**Manifest** — `offerings/ntu/2025-26-s2/_manifest.json`: `{ academic_year, semester, fetched_at, courses: ["EE2010", ...] }` — powers the "what's offered this semester" browse without loading every file.

## 3. Sourcing & ingest (mirrors the `scripts/audit/` provider pattern)

New `scripts/ingest/`, same discipline as the GES provider — **pure normalize + impure fetch**, golden-tested against fixtures so a source HTML/JSON change turns a test red.

- **Catalogue (LIVE):** `catalogue.mjs` fetches the NTUMods `code→title` JSON and normalizes to `catalogue/ntu/<ay>/courses.json`. Working today.
- **Offerings (pipeline real, live-fetch TODO):** `offerings.mjs` holds the pure normalizers `normalizeOwaSchedule()` and `normalizeNtumodsTimetable()` (each fixture-tested) plus documented `fetch*` stubs. Live wiring needs a captured real sample:
  - **OWA** `wis.ntu.edu.sg/webexe/owa/aus_schedule…` — POST-driven legacy page; the durable source of record.
  - **NTUMods timetable JSON** — cross-check to catch parser drift ("two independent sources agree").
- **Build:** `build-offerings.mjs` turns normalized records into per-course snapshots + a manifest.
- **Cadence:** fortnightly cron; tightened to ~daily during the registration / add-drop window. Same "propose a reviewable diff, never silently mutate" ethos — a scan that changes the *catalogue* opens a PR; offerings regenerate as build artifacts.

## 4. Serving

Per-course static JSON (like `rulebook.json`, and exactly NTUMods' proven CDN approach): the explorer fetches only the courses on screen. Rejected: one giant `offerings.json` (all-NTU is too large for the client); a database (infra not currently run).

`catalogue/` is committed (reviewable reference). Offering snapshots are **build artifacts** — regenerated per scan, not committed per-scan (fortnightly churn would be history noise); a small sample is committed to document the layout.

## 5. Freshness, ToS, provenance

- Every snapshot surfaces **"as of {fetched_at} — confirm live vacancies in STARS."** Never authoritative on seats.
- ToS: read-only *public* course info (no student PII); low request rate, cached, attributed; NTUMods precedent. A risk to confirm against NTU's terms, not hand-waved.

## 6. Out of scope (each a later spec)

Clash-detection engine · timetable-builder UI · STARS index-list export · live vacancies · per-programme rulebook authoring (degree/grading/specializations for programmes beyond EEE).

## 7. Testing

`scripts/ingest/ingest.test.mjs` (`node --test`): golden tests for catalogue normalize, OWA + NTUMods offering normalize (from fixtures), and snapshot/manifest build. Fixtures encode the real source shapes so a schema drift fails a test.

## 8. File layout

```
catalogue/ntu/ay2025-26/courses.json      # committed reference (code→title[,au,school])
offerings/ntu/2025-26-s2/EE2010.json      # sample snapshot (build artifact shape)
offerings/ntu/2025-26-s2/_manifest.json
scripts/ingest/catalogue.mjs              # LIVE catalogue ingest
scripts/ingest/offerings.mjs              # OWA + NTUMods normalizers (+ fetch TODO)
scripts/ingest/build-offerings.mjs        # records → snapshots + manifest
scripts/ingest/ingest.test.mjs            # golden tests
```
npm: `catalogue:build`, `offerings:build`, `ingest:test`.

## 9. Open items

- Capture a real OWA `aus_schedule` response (POST params `acadsem`, `r_course_yr`, `boption`, `r_subj_code`) to finish live wiring.
- Confirm the current NTUMods timetable data endpoint + license/attribution.
- Decide whether AU is backfilled into the catalogue from the handbook/OWA or left null until needed.
