# NTU student / prospective pain-point research

> **Workstream:** WS1 (pain-point research) of the
> [UX program roadmap](../superpowers/specs/2026-06-17-ux-program-roadmap.md).
> **Date:** 2026-06-17
> **Purpose:** ground the UX changes (WS2–WS5) in what NTU undergrads and
> prospective students *actually* complain about, so we optimise real pain.

## Honesty note on source quality

- **Strong primary sources used:** NTU's own student-run **SSS Club blog**
  (paraphrases student panic in the students' own framing; same campus, same
  policy), an **NTU graduating-student LinkedIn post** on FGO, a **HardwareZone
  forum** thread on getting First Class Honours, a Singapore student-news piece
  (**soapbox.sg**) that directly quotes NTU students/alumni including an EEE
  grad, and **official NTU pages** (IGP, fees, FGO) that establish what's
  confusing by virtue of how much fine print they carry.
- **Reddit caveat:** I deliberately did **not** scrape Reddit (ToS / rate
  limits, per the roadmap). Direct r/NTU / r/SGExams permalinks did not surface
  cleanly through web search, so I have **not invented Reddit quotes**. Where the
  best available evidence is a blog/forum/guide rather than a raw Reddit post, I
  say so. Community-help guides (NTUMods, "All Things NTU") are themselves strong
  *signal that a pain exists* — they were written precisely because students kept
  asking the same questions.
- Quotes are verbatim from the cited URL unless tagged `[paraphrased]`.
  Points with no real source are tagged `[inferred — no source]` and kept in a
  separate section at the end.
- **9 distinct real sources** are cited below (excluding the roadmap itself).

---

## Top 5 priorities

| # | Pain | Who | Severity | Maps to |
|---|------|-----|----------|---------|
| 1 | FGO is irreversible and students declare it without seeing the AU-loss / spec / grad-requirement consequences | student | **High** | WS3 (spec-aware FGO) + engine `/fgo/*` |
| 2 | "Which courses count?" — degree audit + BDE/MPE/spec rules are hard to read, mistakes found too late | student | **High** | WS2 + WS3 |
| 3 | Specialization (track) choice anxiety — 8 EEE tracks, Y3 electives are prerequisites locking Y4 options | student | High | WS3 |
| 4 | CGPA / honours-class stress — students can't easily see "what grades do I need for First Class" | student | High | engine `/cgpa` + `/honours`, surfaced in WS3/WS4 |
| 5 | IGP is read as a guaranteed cut-off — prospectives mis-judge admission chances | prospective | Medium-High | WS1 → WS4 prospective view |

---

## Prioritized pain points

### 1. FGO is irreversible and declared without seeing the real cost

- **Who:** student
- **Pain:** Students treat FGO as a "remove bad grade" button and declare under
  time pressure, not realising a No Record destroys AUs, can push graduation
  back a semester, breaks prerequisite chains, and can disqualify a course from
  a spec / minor / second-major requirement — and it can never be undone.
- **Evidence:**
  - "A 'No Record' means your AUs are completely lost. The course disappears
    from your transcript. Many students view FGO as a simple way to 'remove bad
    grades', forgetting that losing AUs is not neutral since it costs you time,
    effort, and in some cases, even pushes graduation back by an extra
    semester." — NTU SSS Club blog, *The Other Side of FGO*
    (https://blogs.ntu.edu.sg/sao-sssclub/2025/12/30/the-other-side-of-fgo-when-flexibility-costs-you-more-than-you-think/)
  - "Cue the panic. 'What is this again? Is it like S/U?' 'Should I declare it
    now or later?' 'Wait—will this mess up my minor or my second major?'" — NTU
    SSS Club blog, *A Friendly Guide to FGO*
    (https://blogs.ntu.edu.sg/sao-sssclub/2025/06/14/the-ntu-flexible-grading-option-fgo-a-friendly-guide-for-sss-students/)
  - "Set a calendar reminder. Set five. NTU doesn't take late declarations. At
    all. … Declarations are final. Once you submit, there's no 'undo' button." —
    same SSS Club guide.
  - On FGO being a derivative-style irreversible option whose value rises with
    grade volatility (i.e. it rewards inconsistency, not effort): NTU graduating
    student, LinkedIn
    (https://www.linkedin.com/posts/emmanuelmlai_ntu-just-made-getting-a-degree-easier-and-activity-7460073614067916800-wIaO)
- **Severity:** **High.** This is the single highest-liability, highest-regret
  action in the whole student journey, and it is literally the rule the project
  exists to protect (`CLAUDE.md`: "FGO is irreversible"). The community itself
  is publishing warning articles — proof the in-product guardrails NTU ships are
  not enough.
- **Platform change:** **WS3 + engine.** Make the FGO suggester **spec-aware and
  grad-requirement-aware** (roadmap WS3 already proposes this). Before any FGO
  declaration the optimizer should show, per candidate course: (a) AU-loss if NR,
  (b) whether it's a prerequisite / spec-counting / minor course (FGO-locked),
  (c) the irreversibility + "verify with the Office of Academic Services"
  disclaimer the engine already enforces. This is the flagship use of the
  `/fgo/simulate`, `/fgo/quota`, `/fgo/suggest` + `/specialization/check`
  endpoints together.

### 2. "Which courses actually count?" — degree audit & elective rules are opaque

- **Who:** student
- **Pain:** The degree audit + the BDE / MPE / UE / spec rules are confusing.
  Students register modules that turn out not to count toward their specific
  programme, and only discover it during a later audit — too late to fix.
- **Evidence:**
  - "Being able to see a module in STARS does not confirm you can take it, count
    it, or will be allowed to complete registration. … Always verify against your
    degree audit separately." — NTUMods, *NTU STARS Guide*
    (https://ntumods.com/articles/ntu-stars-guide)
  - "Taking a module you later discover does not count as a BDE for your
    programme is one of the most frustrating registration mistakes students
    make. Verify before the add/drop period closes, not after." — NTUMods,
    *Does BDE Count Towards Your NTU Degree?*
    (https://ntumods.com/articles/does-bde-count-towards-degree-ntu)
  - On FGO interacting with this: "If you declare FGO on an MPE-BDE course, it
    gets reclassified as a BDE … so you'll need to take another MPE." — SSS Club
    FGO guide (same URL as #1). The *existence* of dedicated explainer pages for
    BDE vs UE vs MPE ("NTU made this a bit more complicated than it needs to be")
    is itself the evidence the taxonomy is hard.
- **Severity:** **High.** Directly in this product's lane — the rulebook already
  encodes AU structure, spec rules and the audit parser exists. A
  plain-language "here's what counts and what's left" view is exactly the gap.
- **Platform change:** **WS2 + WS3.** After `/parse-audit`, persist the parsed
  courses (WS2 session persistence) and render a readable "requirements met /
  remaining" breakdown driven by the rulebook (total AU, BDE AU, MPE, spec
  design/technical counts). This turns the hard-to-read official audit into the
  legible view students are clearly hunting for. Keep every figure rulebook-
  sourced and confidence-badged (`CLAUDE.md` rule).

### 3. Specialization (track) choice anxiety — 8 EEE tracks, locked early by Y3 electives

- **Who:** student
- **Pain:** EEE offers **8** final-year specializations, and Year-3 Major
  Prescribed Electives are *prerequisites to most Year-4 design/technical
  electives* — so a Y3 choice silently locks or unlocks whole Y4 tracks, and
  students must commit before they fully understand the consequences.
- **Evidence:**
  - "Students should note that the Year 3 Major Prescribed Elective courses are
    prerequisites to most Year 4 design and technical elective courses. … EEE
    provides eight optional areas of specialization." — NTU EEE Y3 Specialisation
    doc (AY2024/25), via Course Hero
    (https://www.coursehero.com/file/240789906/Ntu-Eee-Y3-Specialisation-ILIDEINFO-Platform-PDF-Viewerpdf/)
  - "I had a headache about which modules should I choose… After googling and
    all, I have decided…" — NTU EEE Y4 student blog, *Welcome to my life*
    (https://cckz96.wordpress.com/2021/06/10/ntu-year-4-semester-2/)
  - "I only took this because it was required for my Computer Engineering
    specialization. I did not expect it to take up such a disproportionate
    amount of time." — NTU EEE course-review blog, *Bell Curve Dog*
    (https://onedegreemanyopportunities.blogspot.com/2024/02/course-review-ntu-eee-eee-y4s1-ay2122.html)
    (a spec requirement forcing a bad course choice = the downstream cost of the
    early lock-in).
- **Severity:** **High.** Core to the Optimizer's value proposition and squarely
  WS3. The prerequisite-chain angle (Y3 → Y4) is a concrete, rulebook-encodable
  insight, not a vague "help me choose."
- **Platform change:** **WS3.** The eligibility + drill-down view should show,
  per spec: progress (counted_au / required_au, design/technical counts from
  `/specialization/check`) **and** which Y3 prescribed electives are
  prerequisites gating that spec's Y4 courses — i.e. "to keep IC Design open you
  need EE3019 this year." Surface the FGO-locked warning here too (spec courses
  can't be FGO'd). This is the "what's left to secure this spec" drill-down the
  roadmap already scopes.

### 4. CGPA / honours-classification stress — "what do I need for First Class?"

- **Who:** student
- **Pain:** Honours class is determined entirely by CGPA thresholds (First Class
  ≥ 4.50, etc.), engineering needs ≥ A- in FYP for First Class, and scholarship
  bonds / govt pay tiers hinge on it — but students have no easy way to model
  "what grades across my remaining AUs get me to X."
- **Evidence:**
  - "Engineering and computing students often need a CGPA above 4.00 to qualify
    for industry scholarship bonds and competitive internship programmes… You
    need a CGPA of 4.50 or above out of 5.0 to graduate with First Class
    Honours." — GPACalc NTU page (https://gpacalc.app/schools/ntu/) — the very
    existence of multiple third-party NTU GPA calculators (also
    https://www.smartcalculator.sg/education/gpa-calculator-ntu) is evidence
    students need projection tools NTU doesn't give them.
  - "For programmes under the College of Engineering … a minimum CGPA of 4.50
    plus at least an 'A-' grade for the Final Year Project are required for the
    award of a First Class Honours degree." — NTU eBulletin
    (https://www3.ntu.edu.sg/oas2/nanyangbulletin/NB1112/HTML/NTU%20Bulletin%20eBook/files/assets/seo/page37.html)
  - "Spend the time i will spend in studying elective to study my core … If you
    can't do well in your core, you won't get FCH anw." — HardwareZone forum,
    *Share some tips on getting FCH* (https://forums.hardwarezone.com.sg/threads/share-some-tips-on-getting-fch.5267317/)
- **Severity:** **High.** The engine's CGPA oracle already targets a real
  Degree-Audit CGPA (3.74 per `CLAUDE.md`); `/cgpa` and `/honours` exist. The
  pain is purely surfacing.
- **Platform change:** **Engine + WS3/WS4.** Expose a "grades-needed-to-reach-
  class-X" view over `/cgpa` + `/honours`: given completed AUs/CGPA and remaining
  AUs, show the average grade needed for each honours band, with the FYP A-
  caveat for engineering pulled from the rulebook. Pair with the FGO simulator so
  students see honours impact before declaring (ties to pain #1).

### 5. IGP read as a guaranteed cut-off — prospectives mis-judge their chances

- **Who:** prospective
- **Pain:** Prospective students (and parents) read the Indicative Grade Profile
  as a hard cut-off: "if I meet the IGP I'm in / if I'm below it I'm out." Both
  readings are wrong — it's a 10th–90th percentile snapshot of last year's
  intake, ignores prerequisites and aptitude-based admissions, and changes
  yearly.
- **Evidence:**
  - "Misread #1: 'If I meet the IGP, I'm in.' Not true. IGP is indicative, not a
    guarantee. … Misread #2: 'IGP tells me whether I'm eligible.' IGP doesn't
    check prerequisites for you." — Eclat Institute IGP explainer
    (https://eclatinstitute.sg/blog/IGP-Singapore-Universities-How-to-Interpret-2026)
  - "Meeting the previous year's grade/GPA scores of a programme does not
    guarantee admission … The grade profiles and polytechnic GPAs are to be used
    as a guide only." — official NTU IGP notice
    (https://www3.ntu.edu.sg/oad2/website_files/IGP/NTU_IGP.pdf)
  - "IGP represents the 10th percentile score of admitted students (not minimum
    requirement)." — SGSchoolKaki NTU IGP
    (https://sgschoolkaki.com/ntu-igp-2025-2026)
- **Severity:** **Medium-High.** Lower liability (read-only, prospective track)
  but high reach — it's a first-touch decision and the Explorer is the
  shippable public v1.
- **Platform change:** **WS1 → WS4 prospective view.** The admissions page
  should present IGP **with its own caveat baked in**: explain the 10th/90th
  percentile meaning, "indicative not a cut-off," the prerequisite + ABA
  asterisks, and that it shifts yearly — surfaced via the existing `confidence`
  badge pattern. Cheap, high-value Explorer polish for the role-based
  prospective view (WS4).

### 6. STARS / "STAR Wars" registration & timetable scramble

- **Who:** both (mostly student; freshmen prospectives anticipate it)
- **Pain:** Course registration ("STAR Wars") is a high-stress, fastest-fingers
  scramble: lab indexes have few slots, BDEs ballot, clashes and prerequisite
  rejections are common, and students don't know to plan backups or use
  add/drop.
- **Evidence:**
  - "If you are new to NTU, STARS can feel confusing the first time you use it."
    — NTUMods STARS guide (https://ntumods.com/articles/ntu-stars-guide)
  - "When July comes, it is time for yet another STAR Wars. Whether you are a
    starry-eyed freshie or a STARS veteran…" + "You have successfully made it
    through the second most nerve-wrecking part of the semester. … Take a break
    if you need to get your cortisol levels back in order." — NTU SSS Club, *Making
    the Best Use of STARS*
    (https://blogs.ntu.edu.sg/sao-sssclub/2025/06/14/charting-your-course-making-the-best-use-of-stars/)
    and NTU-DSAI STARS guide
    (https://github.com/NTU-DSAI/NTU-DSAI.github.io/blob/master/docs/User-Guides/STARS.md)
- **Severity:** **Medium.** Real and widespread, but **partly out of scope** —
  this product is not a registration/timetabling tool and NTUMods/STARS Planner
  already own this space. The *requirements* half (what to register to satisfy
  graduation/spec) is in scope; the *bidding mechanics* are not.
- **Platform change:** **Bounded WS3 overlap, not a new build.** Don't build a
  timetable planner. Do make the eligibility view answer "what should I register
  next to stay on track for graduation + my chosen spec" (the requirements input
  to registration), and link out to NTUMods/STARS for the bidding mechanics. If
  expanded later, this is a candidate **new workstream (WS6: course-plan /
  what-to-take-next)** — flag, don't scope now.

### 7. Fees / Tuition Grant / bond confusion (prospective)

- **Who:** prospective (esp. PR & international; also scholarship holders)
- **Pain:** The fee structure is a maze: subsidised vs non-subsidised, MOE
  Tuition Grant (auto for Singaporeans, opt-in + 3-year bond for PR/international),
  separate scholarship bonds that run concurrently, sureties, loan schemes, and
  fee changes if you exceed normal candidature.
- **Evidence:**
  - "For all non-Singaporean students … in exchange for the grant received under
    the Tuition Grant Scheme, they are required to sign the Tuition Grant
    Agreement in which they will be contractually obliged to work in a Singapore
    entity for three (3) years upon graduation." — NTU Tuition Grants page
    (https://www.ntu.edu.sg/admissions/undergraduate/financial-matters/tuition-grants)
  - "The TG Bond and the scholarship bond are two separate obligations … You may
    however serve the 6-year Scholarship Bond and the 3-year TG Bond
    concurrently." — NTU Bond Obligations
    (https://www.ntu.edu.sg/life-at-ntu/student-life/student-services/onestop/bond-management/bond-obligations)
  - The fee page maintains a long FAQ on sureties, surety changes, and
    eligibility precisely because applicants get this wrong.
- **Severity:** **Medium.** Lower than the academic-core pains, but it's a real
  prospective decision and the Explorer already has an admissions/fees surface
  (`rulebook/.../admissions.yaml`).
- **Platform change:** **WS4 prospective view (light).** Keep the admissions page
  as a clear, confidence-badged summary of fee tiers + grant/bond basics with
  links to the authoritative NTU pages — explicitly **not** financial advice.
  Low effort, sourced from `admissions.yaml`. Do not over-invest; it's a
  secondary prospective need.

---

## Inferred points (no direct source found — keep separate, treat as hypotheses)

- **`[inferred — no source]` Cross-page state loss in tools causes abandonment.**
  General UX principle, not NTU-specific evidence: a student who uploads an audit
  and loses it on navigation will abandon. This is the stated motivation for
  **WS2 session persistence** in the roadmap; included here only to confirm WS2
  addresses a plausible (un-sourced) friction, not a researched complaint.
- **`[inferred — no source]` Students want spec → career mapping at decision
  time.** The Explorer already maps specializations to careers (`careers.yaml`),
  and pain #3 shows spec-choice anxiety, so it's reasonable that career outcomes
  should be visible *at* the spec-choice moment — but I found no direct quote of
  a student asking for this specific pairing. Treat as a design hypothesis for
  WS3/WS4, not a researched pain.

---

## How this feeds the roadmap

- **WS3 (specialization eligibility + spec-aware FGO)** absorbs the two highest-
  severity, highest-liability pains (#1 FGO regret, #3 spec anxiety) and most of
  #2 — it should be the top build priority after WS2 unblocks it.
- **WS2 (session persistence)** is the prerequisite for #2/#3 being usable across
  pages — confirmed foundational.
- **Engine** already has the primitives for #1, #2, #4 (`/fgo/*`, `/parse-audit`,
  `/cgpa`, `/honours`, `/specialization/check`); the gap is *surfacing*, not
  computing.
- **WS4 (role-based UX)** owns the prospective pains (#5 IGP, #7 fees) — cheap,
  high-reach Explorer polish that fits the "ship Explorer publicly" strategy.
- **Out of scope / flag-only:** #6 STARS bidding mechanics (NTUMods owns it);
  candidate **WS6 "what to take next"** if expanded later.
