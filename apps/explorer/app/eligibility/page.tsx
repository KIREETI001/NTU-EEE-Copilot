"use client";

import Link from "next/link";
import { useState } from "react";

import type { components } from "@/lib/engine-schema";
import { useStudentSession } from "@/app/providers/StudentSession";

// =============================================================================
// ELIGIBILITY  —  the student layer's specialization drill-down.
//
// After uploading a Degree Audit on /optimizer, this view answers: which of the
// 8 EEE specializations am I recognised for, which am I on track for, and what
// exactly is left to secure each one? It reads the SAME session-persisted
// courses as the optimizer (StudentSession) and POSTs them to the engine's
// /specialization/plan — all recognition logic lives server-side (single source
// of truth). This UI holds NO grading rules.
//
// The liability bit: AY2025-26 excludes FGO'd courses from a specialization, so
// the courses currently counting toward a spec are FGO-LOCKED — declaring FGO on
// them forfeits the spec. The drill-down surfaces that with the irreversibility
// + "verify with the Office of Academic Services" disclaimer.
//
// Start the engine first:  cd services/engine && uvicorn app.main:app --port 8000
// =============================================================================

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8000";
const COHORT = { university: "ntu", programme: "eee", cohort: "ay2025-26" };

type SpecializationPlan = components["schemas"]["SpecializationPlan"];
type PlanMap = Record<string, SpecializationPlan>;

export default function EligibilityPage() {
  // Same session-persisted courses the optimizer uses — upload once on
  // /optimizer, available here without re-entry.
  const { rows, hasData } = useStudentSession();

  const [plans, setPlans] = useState<PlanMap | null>(null);
  const [open, setOpen] = useState<string | null>(null); // drilled-down spec slug
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Build the engine's `courses` payload exactly as the optimizer does.
  function toCourses() {
    return rows
      .filter((r) => r.code.trim())
      .map((r) => ({
        code: r.code.trim(),
        title: r.code.trim(),
        au: Number(r.au) || 0,
        category: r.category,
        grade: r.grade,
        fgo_applied: r.fgo_applied,
        spec_type: null,
      }));
  }

  async function checkEligibility() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`${ENGINE}/specialization/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...COHORT, courses: toCourses() }),
      });
      if (!res.ok) throw new Error(`Engine returned ${res.status}`);
      setPlans((await res.json()) as PlanMap);
    } catch (e: any) {
      setErr(
        `Could not reach the engine at ${ENGINE}. Start it with:  cd services/engine && uvicorn app.main:app --port 8000   (${e.message})`
      );
    } finally {
      setBusy(false);
    }
  }

  // Order: recognised first, then closest to recognition (by counted AU).
  const ordered = plans
    ? Object.values(plans).sort((a, b) => {
        if (a.recognized !== b.recognized) return a.recognized ? -1 : 1;
        return b.counted_au - a.counted_au;
      })
    : [];

  return (
    <div>
      <header className="mb-6 border-b border-line pb-6">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-ember">
          Undergrad · private layer
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Specialization eligibility</h1>
        <p className="mt-2 text-ash">
          Which of the 8 EEE specializations you&apos;re recognised for — and exactly what&apos;s
          left to secure each one — computed by the engine from the courses you uploaded on the
          optimizer.
        </p>
      </header>

      {/* No uploaded courses → point the student at the optimizer first. */}
      {!hasData ? (
        <div className="rounded-lg border border-line bg-surface p-6">
          <p className="font-mono text-xs uppercase tracking-wider text-ash">No courses yet</p>
          <p className="mt-2 text-sm leading-relaxed text-bone">
            Upload your Degree Audit on the optimizer first — your courses are kept in this
            browser session and shared with this page, so you only enter them once.
          </p>
          <Link
            href="/optimizer"
            className="mt-4 inline-flex items-center rounded bg-ember px-3 py-1.5 font-mono text-xs font-semibold text-canvas"
          >
            go to the optimizer →
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button
              onClick={checkEligibility}
              disabled={busy}
              className="rounded bg-ember px-3 py-1.5 font-mono text-xs font-semibold text-canvas disabled:opacity-40"
            >
              {busy ? "checking…" : plans ? "re-check eligibility" : "check my eligibility →"}
            </button>
            <Link
              href="/optimizer"
              className="rounded border border-line px-3 py-1.5 font-mono text-xs text-ash hover:border-ash hover:text-bone"
            >
              edit my courses
            </Link>
            <span className="font-mono text-[11px] text-ash">
              {toCourses().length} course(s) in this session
            </span>
          </div>

          {err && (
            <p className="mb-6 rounded border border-bad/40 bg-bad/5 px-3 py-2 font-mono text-[11px] text-bad">
              {err}
            </p>
          )}

          {ordered.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {ordered.map((plan) => (
                <EligibilityCard
                  key={plan.slug}
                  plan={plan}
                  expanded={open === plan.slug}
                  onToggle={() => setOpen(open === plan.slug ? null : plan.slug)}
                />
              ))}
            </div>
          )}

          {plans && ordered.length === 0 && (
            <p className="text-sm text-ash">No specializations returned by the engine.</p>
          )}
        </>
      )}
    </div>
  );
}

function EligibilityCard({
  plan,
  expanded,
  onToggle,
}: {
  plan: SpecializationPlan;
  expanded: boolean;
  onToggle: () => void;
}) {
  const auPct = plan.required_au > 0 ? Math.min(100, (plan.counted_au / plan.required_au) * 100) : 0;

  return (
    <div
      className={`rounded-lg border p-4 ${
        plan.recognized ? "border-ember/50 bg-ember/5" : "border-line bg-surface"
      }`}
    >
      <button onClick={onToggle} className="w-full text-left" aria-expanded={expanded}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-bone">{plan.name}</h2>
          <span
            className={`shrink-0 rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
              plan.recognized
                ? "bg-ember/20 text-ember"
                : "border border-line text-ash"
            }`}
          >
            {plan.recognized ? "recognised" : "on track"}
          </span>
        </div>

        {/* AU progress */}
        <p className="mt-3 font-mono text-[11px] text-ash">
          {plan.counted_au} / {plan.required_au} AU counting
        </p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-line">
          <div
            className={`h-full ${plan.recognized ? "bg-ember" : "bg-ember/50"}`}
            style={{ width: `${auPct}%` }}
          />
        </div>

        {/* design / technical progress */}
        <p className="mt-2 font-mono text-[11px] text-ash">
          design {plan.design_count}/{plan.min_design} · technical{" "}
          {plan.technical_count}/{plan.min_technical}
        </p>

        <p className="mt-3 font-mono text-[11px] text-ember">
          {expanded ? "− hide what's left" : "+ what's left to secure it"}
        </p>
      </button>

      {expanded && <DrillDown plan={plan} />}
    </div>
  );
}

function DrillDown({ plan }: { plan: SpecializationPlan }) {
  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      {/* Courses still needed to secure the spec. */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-wider text-ash">
          Courses to secure it ({plan.remaining_needed.length})
        </p>
        {plan.remaining_needed.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {plan.remaining_needed.map((code) => (
              <li
                key={code}
                className="rounded border border-line bg-surface px-2 py-1 font-mono text-[11px] text-bone"
              >
                {code}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ash">
            {plan.recognized
              ? "Nothing more needed — this track is already recognised."
              : "No further track courses listed."}
          </p>
        )}
      </div>

      {/* Courses currently counting. */}
      {plan.completed_counting.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-ash">
            Already counting ({plan.completed_counting.length})
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {plan.completed_counting.map((code) => (
              <li
                key={code}
                className="rounded border border-ember/40 bg-ember/5 px-2 py-1 font-mono text-[11px] text-ember"
              >
                {code}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* FGO-locked disclaimer — the liability bit, driven by fgo_locked. */}
      {plan.fgo_locked.length > 0 && (
        <div className="rounded border border-bad/40 bg-bad/5 p-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-bad">
            ⚠ FGO is irreversible
          </p>
          <p className="mt-1 text-sm leading-relaxed text-bone">
            These cleared courses count toward {plan.name} —{" "}
            <span className="font-mono text-bad">{plan.fgo_locked.join(" · ")}</span>. If you FGO
            them they no longer count toward this specialization. FGO is irreversible; verify with
            the Office of Academic Services before declaring anything.
          </p>
        </div>
      )}
    </div>
  );
}
