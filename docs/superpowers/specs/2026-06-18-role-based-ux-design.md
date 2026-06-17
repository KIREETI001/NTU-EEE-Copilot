# Design: Role-based UX — student vs prospective (WS4)

**Date:** 2026-06-18
**Status:** Design pass. No build changes shipped here (docs-only deliverable). An
optional flagged scaffold is specified but deferred so `npm run explorer:build`
stays green.
**Workstream:** #4 in `2026-06-17-ux-program-roadmap.md`.
**Author:** Claude (with KIREETI001)

---

## TL;DR for the human

- **Recommended routing:** keep the **single app, one root layout**, and split the
  experience by a **role context (`RoleProvider`) + per-role nav**, NOT by putting
  the role in the URL path and NOT by App-Router route groups. The student-only
  surface stays at its existing route (`/optimizer`, plus future `/eligibility`)
  and is protected by the **server-enforced gate** from
  `2026-06-17-optimizer-access-gate-design.md` — never by the client role toggle.
- **Why:** the route is the security boundary for the high-liability surface, so
  it must be a real path that `middleware.ts` can match. A client role flag is a
  *navigation/affordance* concern (what links you see), not an *access* concern
  (what you can reach). Conflating them is exactly the bypassable-page-gate mistake
  the access-gate doc already corrected.
- **Top open decisions for you** (detailed in §6): (1) Is the prospective view
  fully public on day 1 — yes, recommended. (2) Does role persist across sessions —
  recommend `localStorage` for the *prospective* affordance only; student access is
  governed by the auth cookie, not this flag. (3) Do we support the "current
  student exploring other programmes" combined case — recommend yes, as a
  *superset* nav, not a third role.

---

## 1. Two audiences, two deliberately different surfaces

The liability split in `CLAUDE.md` is the product's spine. This design makes it a
**first-class UX boundary**, not just a folder convention.

| | **Prospective view** | **Student view** |
|---|---|---|
| Who | Pre-uni applicants + undergrads researching other paths | Logged-in EEE undergrad simulating their own standing |
| Surfaces | admissions / IGP / fees / scholarships, specialization browse, careers map | upload degree audit, optimizer (CGPA/FGO), specialization **eligibility**, FGO simulation |
| Reads | compiled `rulebook.json` only | `rulebook.json` **+** the student's own parsed standing |
| Liability | **Low** (read-only browsing of public facts) | **High** (advice on an irreversible action — FGO) |
| Reachability | **Public** | **Gated** (server-enforced; see §1.2) |
| Personal data | none | audit held in-browser for the session only (WS2); never server-persisted |

**The hard line:** nothing in the prospective view ever shows a CGPA, an FGO
quota/suggestion, or an upload control. Those are student-only. The prospective
view answers "is this programme right for me?"; the student view answers "given my
actual standing, what should I do?".

### 1.1 Mapping today's routes onto the two views

The Explorer already implements the rough split; this doc formalises it.

| Route (exists today) | View | Notes |
|---|---|---|
| `/` (home) | **Shared landing** → becomes the role-declaration entry | currently prospective-leaning; see §2 |
| `/specializations/[slug]` | Prospective (also reused by student) | pure `rulebook.json` read |
| `/admissions` | Prospective | IGP / fees / scholarships |
| `/suggest` | Shared (cross-cutting "suggest a fix") | data-quality feedback; available to both |
| `/optimizer` | **Student (gated)** | client component → engine; the asset to protect |
| `/eligibility` (planned, WS3) | **Student (gated)** | specialization eligibility over uploaded courses |

### 1.2 Tie to the auth-proxy (non-negotiable)

The student view is the high-liability surface. Per
`2026-06-17-optimizer-access-gate-design.md`, the optimizer is a client component
that calls the engine **directly from the browser**, so **gating a page route is
not enough on its own** — the engine itself must be private and reached only
through the authenticated same-origin BFF proxy. For this role design that means:

- **The client role flag (`RoleProvider`) is non-authoritative.** It decides which
  nav links and CTAs a user *sees*. It MUST NOT be the thing that decides whether a
  user can *reach* `/optimizer` / `/eligibility` or call the engine.
- **Before any public deploy**, the student routes (`/optimizer/:path*`,
  `/eligibility/:path*`, and the `/api/optimizer/:path*` proxy) MUST be behind the
  server-enforced gate: `middleware.ts` redirects un-authed navigations to
  `/unlock`; the proxy route self-verifies the signed-exp session; the engine has
  no public ingress. The role toggle is a convenience layer **on top of** that gate,
  never a replacement for it.
- **Fail-closed:** if the gate secret is unset, the student routes are
  unreachable, regardless of what role the client thinks it is.

So: **role = which door you see; the gate = whether the door opens.** The doc below
keeps those two concerns physically separate.

---

## 2. Role declaration: landing choice now → real auth later

### 2.1 The interim (no auth yet — matches "local-only for now")

The access-gate doc defers auth entirely until a public deploy. So the *interim*
role mechanism must not pretend to be auth:

- **A landing-page choice.** `/` becomes (or gains a top band that is) a
  **role-declaration step**: two cards — **"I'm exploring NTU EEE"** (prospective)
  and **"I'm a current EEE student"** (student). Choosing prospective sets a
  client-side role flag and routes into the prospective nav. Choosing student
  routes toward the student surface.
- **The prospective choice is fully client-side and non-authoritative** — it only
  toggles nav/affordances over *public* `rulebook.json` content. That is safe: a
  prospective user reaches nothing they couldn't already reach by typing the URL.
- **The student choice does NOT grant access.** In the interim local-only world it
  simply navigates to `/optimizer` (reachable on `localhost` because nothing is
  deployed and the gate is deferred). **At deploy time**, that same navigation hits
  `middleware.ts` → `/unlock` unless a valid session cookie exists. The landing card
  is a signpost; the gate is the lock.

**Concretely, what's authoritative vs not:**

| Concern | Mechanism | Authoritative? |
|---|---|---|
| Which nav/CTAs you see | `RoleProvider` (React context, persisted to `localStorage`) | No — cosmetic |
| Whether you reach `/optimizer` / `/eligibility` | `middleware.ts` + signed-exp cookie (deploy-time) | **Yes** — server-enforced |
| Whether the engine answers | authenticated BFF proxy; engine private | **Yes** — server-enforced |

### 2.2 The later state (real auth)

When per-student auth lands (Supabase / NextAuth, listed as a deploy-time decision
in the access-gate doc), the **session itself carries the role**. At that point:

- The landing choice for *students* is replaced by sign-in; a verified student
  session implies the student role and unlocks the gated routes.
- The prospective experience can remain available **without** sign-in (public by
  default — see §6 Q1), so the public funnel is never blocked behind a login wall.
- `RoleProvider` reads its initial role from the session when present, falling back
  to the `localStorage` flag for anonymous prospective visitors.

This keeps a single migration seam: `RoleProvider`'s *source of truth* moves from
"client flag" to "auth session" without the rest of the UI changing.

---

## 3. Per-role navigation & routing

### 3.1 Three routing approaches considered

| Approach | Shape | Verdict |
|---|---|---|
| **A. Role in path** | `/explore/...` vs `/student/...` | Rejected. Forces a churn of all existing routes (`/admissions` to `/explore/admissions`), duplicates the shared `/specializations/[slug]`, and bakes a *cosmetic* concept (role) into the *security* concept (path). The gate already needs to match real student paths; adding `/student/` prefixes just renames them. |
| **B. App-Router route groups** | `app/(prospective)/...` + `app/(student)/...` with per-group `layout.tsx` | Partial fit. Route groups give you per-group layouts/nav for free and don't change URLs. But they're a *file-organisation* tool, not an *access* tool — a route group does NOT gate anything; you still need `middleware.ts`. They also can't express "this page is shared by both views" (`/specializations/[slug]`) without duplication or a shared segment. Useful later; overkill now. |
| **C. Single app + role context + per-role nav** (RECOMMENDED) | one root `layout.tsx`, a `RoleProvider`, nav renders from the active role; student routes stay where they are and are gated by `middleware.ts` | **Recommended.** Minimal churn (existing routes untouched), shared pages stay shared, and — critically — it keeps the **role (cosmetic) and the gate (security) as separate, independently-evolvable layers.** |

### 3.2 Recommended: one app, role context drives nav, middleware gates access

**Routing:** keep the current flat route structure. No `/explore` or `/student`
prefixes; no route groups (yet).

**Nav:** the header `<nav>` in `apps/explorer/app/layout.tsx` becomes
role-aware. It reads the active role from `RoleProvider` and renders one of two
link sets (a small client `<RoleNav>` component; the root layout stays a server
component and just renders `<RoleNav />`):

```
Prospective nav:  specializations · admissions · careers · suggest a fix
Student nav:      my standing (upload) · optimizer · eligibility · specializations · suggest a fix
                  + a persistent "private · high-liability" marker + a "switch to exploring" affordance
```

Notes:
- `specializations` and `suggest` appear in **both** navs (shared surfaces).
- The student nav surfaces a **standing/upload entry point** and the gated tools.
- A small **role switcher** (e.g. in the header corner) lets a user flip the
  *prospective* affordance without losing state (see §4). Switching *into* the
  student surface still passes through the gate at deploy time.

**Gate (unchanged from access-gate doc):**
`middleware.ts` `matcher: ["/optimizer/:path*", "/eligibility/:path*",
"/api/optimizer/:path*"]`. The role context never appears in the matcher — the
matcher protects *paths*, the context decorates *navigation*.

**Why this is the right altitude for Next 15 App Router specifically:**
- Root layout stays a server component (good for the mostly-static prospective
  content that reads `rulebook.json` at build time); only the thin `<RoleNav>` and
  the role switcher are client components.
- `middleware.ts` runs on the server/edge for every matched request — the correct,
  unbypassable place for the access boundary, independent of any client state.
- If/when the student surface grows enough pages to warrant a distinct chrome, we
  can promote the student routes into an `app/(student)/` **route group with its own
  layout** *without changing URLs or the gate* — Approach C migrates cleanly into
  Approach B later. Starting with C avoids paying that cost before it's needed.

---

## 4. Shared data & data flow

Both roles read the **same compiled `rulebook.json`** (specializations, careers,
admissions, grading, degree). It is the single source of truth, built from the
YAML by `scripts/build-rulebook.mjs` and read through the typed reader
`apps/explorer/lib/rulebook.ts` (`getSpecializations`, `getAdmissions`,
`getCareers`, `getRecognitionRules`, ...). The **only** thing the student view adds
is the student's *personal standing*, layered on top — and that personal layer
lives client-side, never in the rulebook.

```
                       rulebook/**/*.yaml   (SOURCE OF TRUTH, version-controlled)
                                |  scripts/build-rulebook.mjs  (build-time)
                                v
                    apps/explorer/public/rulebook.json   (compiled, generated)
                                |  lib/rulebook.ts (typed reader, server-side)
              +-----------------+-------------------------------+
              v                                                 v
   -- PROSPECTIVE VIEW (public) --             -- STUDENT VIEW (gated) --
   home / specializations / admissions         same rulebook reads
   / careers                                          +
   reads rulebook.json ONLY.                   personal standing layer:
   No personal data. No engine call.           audit PDF -> /parse-audit (engine,
                                                in-memory, never stored)
                                                  -> parsed courses + cross-check
                                                  -> StudentSession (sessionStorage)
                                                  -> /cgpa /fgo/* /specialization/check
                                                     (engine, via gated BFF proxy
                                                      at deploy time)
                                                  -> eligibility & FGO sim render
                                                     rulebook spec lists INTERSECT
                                                     personal courses (the only place
                                                     the two layers meet)
```

Key properties:
- **Rulebook reads are identical for both roles** — the student view never gets a
  "different" rulebook, only an *additional personal overlay*. This preserves the
  one rule that matters: the app only ever states rulebook-vouched facts; the
  personal overlay adds the student's own grades, not new academic claims.
- **The personal layer never touches the server's data tier.** The audit is parsed
  in engine memory and discarded; the result lives in the browser session store
  (WS2). The rulebook is the only shared, server-side data.
- **FGO/eligibility outputs carry the disclaimer** — any surface that combines the
  personal layer with FGO logic keeps the irreversibility + "verify with the
  Office of Academic Services" warning (engine-enforced; the UI must not strip it).

---

## 5. Role switching & state (interaction with WS2)

> **Dependency:** this section designs against
> `apps/explorer/app/providers/StudentSession.tsx`, the session provider being
> built in parallel by **WS2 (Agent 2)**. It is **not present in this worktree**
> yet. The contract below is the *concept* per the roadmap (a React context backed
> by `sessionStorage` holding the `AuditParseResult` + editable rows + last
> computed CGPA/quota/sim). If WS2's final API differs, reconcile field names; the
> behavioural rules here should hold regardless.

### 5.1 What happens to an uploaded audit when the user switches to prospective mode

**Principle: switching the *view* must never destroy the student's *data*.** Role
is a presentation flag; the audit is session data. They are decoupled on purpose.

- A student uploads an audit -> it populates `StudentSession` (backed by
  `sessionStorage`: survives navigation **and** in-tab reload; cleared on tab/session
  close — the exact WS2 semantics).
- The student flips the role switcher to **"exploring"** (prospective). This:
  - changes `RoleProvider`'s active role -> nav swaps to the prospective set;
  - **does NOT touch `StudentSession`.** The parsed audit stays in `sessionStorage`,
    untouched.
  - The prospective view simply *doesn't read* the personal layer (it only reads
    `rulebook.json`). So no CGPA/FGO leaks into the prospective surface — the data
    is present but unreferenced.
- The student flips back to **"student"** -> nav swaps back, and the optimizer /
  eligibility pages re-hydrate from the still-present `StudentSession`. **Upload
  once; it persists across role toggles and page navigations for the session.**

This is the cleanest possible coupling: **two independent stores** —
`RoleProvider` (cosmetic, may persist to `localStorage` across sessions) and
`StudentSession` (personal, `sessionStorage`, dies with the tab). Neither clears
the other.

### 5.2 Explicit "clear my data"

Because the personal layer is sensitive (grades), provide an explicit **"end
session / clear my data"** control in the student nav that wipes `StudentSession`
immediately — independent of role and independent of tab close. (Whether tab-close
alone is sufficient, or this explicit button is also wanted, is an open WS2
question already flagged in the roadmap; this design assumes the button exists and
ties the student nav to it.)

### 5.3 Edge cases

- **Prospective user who never had a session** -> `StudentSession` is empty; the
  role switcher to "student" leads to the gate/upload step. Nothing to preserve.
- **Deploy-time, un-authed user picks "student"** -> `middleware.ts` redirects to
  `/unlock` before any page renders. The role flag does not bypass this.
- **Session present but gate expired** (cookie past `exp`) -> the engine proxy
  returns 401; the optimizer page should treat this as "re-unlock needed" while
  keeping the `sessionStorage` data intact (so the student re-unlocks and resumes,
  not re-uploads). Worth a note to WS2 + the access-gate implementer.

---

## 6. Open decisions for the user (please rule on these)

1. **Is the prospective view fully public on day 1?**
   *Recommendation: yes.* It reads only `rulebook.json` (public, low-liability),
   it is the public funnel, and gating it behind a role wall would kill the
   Explorer's whole "shippable as public v1" premise. The role landing should be
   *skippable* / default to prospective, not a hard gate.
   -> If yes, confirm the role-declaration landing is a soft prompt, not a blocker.

2. **Does role persist across sessions?**
   *Recommendation:* persist the **prospective** affordance in `localStorage`
   (returning visitors skip the landing prompt), but **student access never
   persists via the client flag** — it is governed solely by the auth cookie's
   `exp`. So "role persists" is true only for the cosmetic prospective default;
   real student access always re-checks the gate.
   -> Confirm you're comfortable with `localStorage` remembering "this browser
   prefers the prospective view".

3. **Is there a combined "I'm a current student exploring other programmes" case?**
   *Recommendation: yes, handle it as a nav superset, not a third role.* A
   signed-in student gets the **student nav** which *already includes* the
   prospective surfaces (specializations, careers, admissions) — so an undergrad
   researching another track just uses the prospective pages while staying in the
   student view. No separate role needed; avoids a 3-way matrix.
   -> Confirm: one student nav that is a superset, vs. a distinct "student-exploring"
   mode. (Recommend the former.)

4. **Where does the role landing live — `/` itself, or a dedicated `/start`?**
   *Recommendation:* a band on `/` (home stays the entry), behind the optional
   `NEXT_PUBLIC_ROLE_LANDING` flag (§7), so it can be turned on without disrupting
   the current public home. -> Confirm placement.

5. **Does the student nav show the gated tools to an un-authed user (as locked
   teasers) or hide them entirely?**
   *Recommendation:* show them as **visible-but-locked** entries that route to
   `/unlock`, so the value is discoverable but access stays server-enforced. ->
   Confirm "locked teaser" vs "hidden until authed".

6. **Naming.** "Prospective" vs "Explore"; "Student" vs "My standing" /
   "Optimizer". -> Pick the labels (affects nav copy only, not architecture).

---

## 7. Optional scaffold (DEFERRED — not shipped in this commit)

The roadmap permits a tiny role-landing scaffold behind `NEXT_PUBLIC_ROLE_LANDING`
*only if it keeps `npm run explorer:build` green*. **This commit ships docs only**
— no `.tsx` touched — to avoid any build risk in a parallel-worktree context where
WS2's `StudentSession` provider does not yet exist. When implemented, the scaffold
should:

- Be **fully behind the env flag** (`NEXT_PUBLIC_ROLE_LANDING !== "1"` -> render the
  current home unchanged). Off by default => zero behavioural change => build stays
  green and nothing destructive ships.
- Add a thin client `RoleProvider` + `<RoleNav>` and a soft role-choice band on
  `/`. **No** changes to `/optimizer`'s engine wiring, **no** changes to
  `middleware.ts` (the gate is a separate deploy-time task), **no** dependency on
  `StudentSession` (read it defensively if present, treat absent as "no session").
- Keep the SoulVector language: charcoal canvas, single ember accent, IBM Plex
  Mono labels — two restrained cards, not a splash screen.

Sequencing: land this scaffold **after** WS2 (`StudentSession`) exists, so the
student nav's "my standing" entry has a real store to bind to. Until then, the
design above is the contract.

---

## 8. Incorporating pain-point research (WS1)

`docs/research/ntu-pain-points.md` (WS1, Agent 1) is **not present in this
worktree** (parallel work). This design is therefore grounded in the roadmap's
stated pain themes (degree-audit being hard to read, FGO/S-U decision regret,
specialization-choice anxiety, CGPA/honours stress, prospective IGP/fees/admissions
confusion) rather than the finished research. **Revisit these decisions once WS1
lands:**

- **Role-declaration framing (§2):** WS1 may show prospective users and undergrads
  describe themselves differently than "exploring" vs "current student". Re-label
  the landing cards to match the words students actually use.
- **Student nav priority (§3.2):** if WS1 confirms "degree audit is hard to read"
  and "FGO regret" dominate, the student nav should lead with **upload -> optimizer**
  (decision support) over eligibility. If specialization-choice anxiety dominates,
  lead with **eligibility**. Order the student nav by the top-ranked pain.
- **Prospective nav priority (§3.2):** if IGP/fees confusion is the top prospective
  pain, surface **admissions** more prominently than the spec browse.
- **Combined-case (§6 Q3):** WS1 may reveal undergrads researching *other* NTU
  programmes is a real, sizeable cohort — if so, the superset nav becomes a
  first-class feature, not an edge case.

Add a short addendum to this doc (or revise §3/§6) when WS1's prioritised pain ->
platform-change map is available.

---

## Appendix — summary of separations this design enforces

| Concern | Layer | Persistence | Authoritative for access? |
|---|---|---|---|
| Which nav/CTAs you see | `RoleProvider` (context) | `localStorage` (prospective default) / session (when authed) | No |
| Whether `/optimizer` `/eligibility` open | `middleware.ts` + signed-exp cookie | cookie `exp` | **Yes** |
| Whether the engine answers | BFF proxy; engine private | server-side session verify | **Yes** |
| The student's parsed standing | `StudentSession` (WS2) | `sessionStorage` (dies on tab close) | n/a (data, not access) |
| Academic facts shown | `rulebook.json` via `lib/rulebook.ts` | build-time, version-controlled | n/a (single source of truth) |

The throughline: **role is cosmetic, the gate is security, and the rulebook is
truth — keep all three in separate layers and they evolve independently without
ever letting the app state a fact the rulebook can't vouch for or letting a casual
visitor reach irreversible-action advice.**
