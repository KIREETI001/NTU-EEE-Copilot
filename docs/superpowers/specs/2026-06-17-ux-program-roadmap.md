# Roadmap: student / prospective UX program

**Date:** 2026-06-17
**Status:** Decomposition + per-piece design notes. Each workstream is its own
fresh-session project (this doc is the handoff so a new session has full context
without re-reading the build history).

---

## What already exists (the lay of the land)

- **Engine** (`services/engine`, Python/FastAPI, venv on Python 3.14):
  endpoints `/cgpa`, `/fgo/quota`, `/fgo/simulate`, `/fgo/suggest`,
  `/specialization/check`, `/honours`, `/parse-audit`, `/health`. 39 tests.
  Responses are typed; the TS types are generated to
  `apps/explorer/lib/engine-schema.ts` (`npm --workspace apps/explorer run types:engine`).
- **Parser** (`app/parser`): `parse_audit_pdf` + a CGPA cross-check (recompute vs
  the audit's stated CGPA). Surfaced as `POST /parse-audit` (PDF in memory, never
  stored). CLI: `python -m app.parser <pdf>`.
- **Explorer** (`apps/explorer`, Next 15): public pages (home / specializations /
  admissions / suggest) ≈ **prospective**; `/optimizer` ≈ **student**, calls the
  engine directly via `NEXT_PUBLIC_ENGINE_URL`.
- **Optimizer flow today:** upload audit PDF → `/parse-audit` → cross-check
  verdict → verified completed courses fill an editable table → FGO buttons.
- **Hard constraint:** the optimizer is **local-only** (browser→engine direct).
  Production needs the private-engine + authenticated-proxy from
  `2026-06-17-optimizer-access-gate-design.md`. The student layer is high-liability.

Engine to run any of this: `cd services/engine && .venv/Scripts/python -m uvicorn app.main:app --reload --port 8000`.

---

## Workstream 1 — Pain-point research (research, not building)

**Goal:** ground the UX changes in what NTU students/prospectives actually
complain about, so we optimise real pain, not guesses.

**Approach:** focused web research (exa / web search), NOT mass-scraping (Reddit
ToS / rate limits). Sources: r/NTU, r/SGExams, NTU subreddits, HardwareZone EDMW
education threads. Themes to mine: course-planning confusion, FGO / S-U decision
regret, specialization choice anxiety, CGPA/honours stress, degree-audit being
hard to read, prospective IGP/admissions/fees confusion.

**Output:** `docs/research/ntu-pain-points.md` — prioritized pain points each
mapped to a concrete platform change. Drives #3 and #4 priorities.

---

## Workstream 2 — Session persistence (well-scoped, foundational)

**Problem:** the optimizer keeps parsed courses in React component state, lost on
navigation between pages. The student should upload once and have it persist
across pages, cleared only when the **session ends** (not on page toggle).

**Design:**
- A React **Context provider** (e.g. `apps/explorer/app/providers/StudentSession.tsx`)
  wrapping the app, backed by **`sessionStorage`**.
- `sessionStorage` semantics fit the ask exactly: survives navigation **and**
  reload within the tab; cleared when the tab/session closes. (Confirm with the
  user whether "session ends" = tab close, or an explicit "end session / clear"
  button is also wanted.)
- Store: the `AuditParseResult` + the editable rows + last computed CGPA/quota/sim.
- **PDPA win:** data lives in the browser only, never server-persisted, gone on
  close. Surface it ("kept in your browser for this session only").

**Dependencies:** none. Foundational for #3 (the eligibility view reuses the same
uploaded courses).

---

## Workstream 3 — Specialization eligibility + drill-down (well-scoped)

**Goal:** after upload, show which specializations the student is eligible for,
click into one to see the courses still needed, with the FGO-cleared disclaimer.

**Reuse the engine:** `POST /specialization/check` already returns, for all 8
specs, `{recognized, counted_au, required_au, design_count, technical_count,
reasons}` given the student's courses. That is the eligibility core.

**Define "eligible" before building** (ask the user): recognised **now**, vs
**on track / could reach** with remaining electives. Most useful is "progress +
what's left": counted_au/required_au + design/technical progress per spec.

**Drill-down per spec:** the spec's design/technical course lists live in
`specializations.yaml` (compiled into `rulebook.json`, already read by the
explorer). "Courses to secure it" = spec list **minus** the student's completed
counting courses.

**FGO-cleared disclaimer (the liability bit):** `recognition_rules.fgo_excluded:
true` — FGO'd courses do NOT count toward a specialization. So the student's
completed courses that count toward a spec are **FGO-locked**: declaring FGO on
them forfeits their contribution. Surface: "These cleared courses count toward
<spec>; FGO-ing them removes them from it." This should also make the FGO
**suggester spec-aware** (today `/fgo/suggest` warns generically; it could avoid
suggesting courses that secure a spec the student wants).

**Build options:** compute client-side from `/specialization/check` +
`rulebook.json` spec lists, OR add a `/specialization/plan` engine endpoint
returning per-spec {counting-completed, remaining-needed, fgo-locked}. Prefer the
engine endpoint (logic server-side, testable, typed).

**Dependencies:** #2 (uploaded courses must be available on this page too).

---

## Workstream 4 — Role-based UX: student vs prospective (NEEDS A DESIGN PASS)

The rough split already exists (Explorer public ≈ prospective, `/optimizer` ≈
student). Formalising it needs decisions (a design session, ideally after #1):
- How does a user declare their role? (landing choice now; real auth later.)
- **Prospective view:** admissions, specialization browse, careers, fees/IGP — no
  CGPA/FGO. **Student view:** upload audit, optimizer, eligibility, FGO — gated.
- Nav/routing per role; shared rulebook data.
- Ties to the **optimizer auth deferral**: the student layer is high-liability and
  needs the private-engine + proxy before any public deploy.

---

## Workstream 5 — "Make the backend better" (NEEDS SPECIFICS)

Not actionable as stated. Clarify with the user:
- Performance (what's slow?), structure/maintainability (it's already layered +
  tested + validated), new capabilities (which?), or deployment?
- **Most likely the real need is the production backend architecture**: private
  engine + authenticated same-origin proxy + signed-exp sessions, already designed
  in `2026-06-17-optimizer-access-gate-design.md`. Confirm before building.

---

## Recommended sequencing

1. **#1 research** — grounds the rest (skip only if pains are already known).
2. **#2 persistence** — foundational for the student multi-page experience.
3. **#3 specialization eligibility** — builds on #2 + the existing engine.
4. **#4 role-UX** — design (informed by #1) → build, after #2/#3 exist to organise.
5. **#5** — clarify; likely resolves to the deploy-time backend (auth proxy + hosting).

## Starting a fresh session for any piece

- Open a new session (cheap — it won't re-read this build history).
- Point it at this roadmap + the relevant spec docs under `docs/superpowers/specs/`.
- Re-attach the Degree Audit PDF if exercising the parser/optimizer flow.
- Start the engine (command above) before testing `/optimizer`.
