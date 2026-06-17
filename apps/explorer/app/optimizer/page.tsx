"use client";

import { useState } from "react";

import type { components } from "@/lib/engine-schema";

// =============================================================================
// OPTIMIZER  —  the high-liability layer. Enter your standing, see CGPA, FGO
// quota, and a MATH-ONLY suggestion of which courses to FGO to lift your CGPA.
//
// This UI holds NO grading logic. Every number comes from the Python engine
// (single source of truth, 20 tests). It POSTs to NEXT_PUBLIC_ENGINE_URL.
// Start the engine first:  cd services/engine && uvicorn app.main:app --port 8000
//
// ⚠ Before any PUBLIC deploy, gate this route behind auth. FGO is irreversible;
//   never show suggestions to a casual visitor as if they were advice.
// =============================================================================

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8000";
const COHORT = { university: "ntu", programme: "eee", cohort: "ay2025-26" };

const GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D+", "D", "F"];
const CATEGORIES: { id: string; label: string; fgo: boolean }[] = [
  { id: "CORE", label: "Major Core", fgo: true },
  { id: "MPE", label: "Major Prescribed Elective", fgo: true },
  { id: "MPE_BDE_OPTION", label: "MPE (BDE option)", fgo: true },
  { id: "ICC_CC", label: "ICC Common Core", fgo: true },
  { id: "FC", label: "Foundation Core", fgo: true },
  { id: "BDE", label: "Broadening & Deepening", fgo: true },
  { id: "FYP", label: "Final Year Project — FGO-ineligible", fgo: false },
  { id: "INTERNSHIP", label: "Professional Internship — FGO-ineligible", fgo: false },
];

type Row = {
  code: string;
  au: number;
  category: string;
  grade: string;
  fgo_applied: boolean;
};

const SEED: Row[] = [
  { code: "EE2101", au: 3, category: "CORE", grade: "A-", fgo_applied: false },
  { code: "EE2102", au: 3, category: "CORE", grade: "B+", fgo_applied: false },
  { code: "IE2108", au: 3, category: "CORE", grade: "B", fgo_applied: false },
  { code: "BDE101", au: 3, category: "BDE", grade: "C+", fgo_applied: false },
];

// Engine response types are GENERATED from the engine's OpenAPI schema
// (npm run types:engine) — not hand-mirrored, so contract drift is a compile error.
type Quota = components["schemas"]["FgoQuotaStatus"];
type Sim = components["schemas"]["FgoSimulation"];

export default function OptimizerPage() {
  const [rows, setRows] = useState<Row[]>(SEED);
  const [cgpa, setCgpa] = useState<number | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [suggested, setSuggested] = useState<string[] | null>(null);
  const [sim, setSim] = useState<Sim | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function call(path: string, extra: Record<string, unknown> = {}) {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`${ENGINE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...COHORT, courses: toCourses(), ...extra }),
      });
      if (!res.ok) throw new Error(`Engine returned ${res.status}`);
      return await res.json();
    } catch (e: any) {
      setErr(
        `Could not reach the engine at ${ENGINE}. Start it with:  cd services/engine && uvicorn app.main:app --port 8000   (${e.message})`
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function computeCgpa() {
    const r = await call("/cgpa");
    if (r) setCgpa(r.cgpa);
  }
  async function checkQuota() {
    const r = await call("/fgo/quota");
    if (r) setQuota(r);
  }
  async function suggest() {
    const r = await call("/fgo/suggest");
    if (r) setSuggested(r.suggested_codes);
  }
  async function simulateSuggested() {
    if (!suggested?.length) return;
    const r = await call("/fgo/simulate", { fgo_codes: suggested });
    if (r) setSim(r);
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { code: "", au: 3, category: "BDE", grade: "B", fgo_applied: false }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <header className="mb-6 border-b border-line pb-6">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-ember">
          Undergrad · private layer
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">FGO &amp; CGPA optimizer</h1>
        <p className="mt-2 text-ash">
          Enter your standing, then let the engine compute CGPA, your FGO quota, and a
          math-only suggestion of which courses to convert to maximize CGPA.
        </p>
      </header>

      {/* The irreversibility banner is non-negotiable. It stays on screen always. */}
      <div className="mb-6 rounded-lg border border-bad/40 bg-bad/5 p-4">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-bad">
          ⚠ FGO is irreversible
        </p>
        <p className="mt-1 text-sm leading-relaxed text-bone">
          Declaring FGO on a course cannot be undone, and quota is spent per attempt.
          Everything below is a <span className="text-bad">math-only</span> simulation — it
          ignores specialization loss, honours strategy, scholarship/accreditation needs, and
          grad-school scrutiny. Deconflict those yourself and confirm with the Office of
          Academic Services before declaring anything.
        </p>
      </div>

      {/* course table */}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface2 font-mono text-[10px] uppercase tracking-wider text-ash">
            <tr>
              <th className="px-3 py-2 text-left">Course</th>
              <th className="px-3 py-2 text-left">AU</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Grade</th>
              <th className="px-3 py-2 text-left">FGO?</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const cat = CATEGORIES.find((c) => c.id === r.category);
              return (
                <tr key={i} className="border-t border-line">
                  <td className="px-3 py-2">
                    <input
                      value={r.code}
                      onChange={(e) => update(i, { code: e.target.value })}
                      placeholder="EE2102"
                      className="w-24 rounded border border-line bg-surface px-2 py-1 font-mono text-xs outline-none focus:border-ember"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={r.au}
                      onChange={(e) => update(i, { au: Number(e.target.value) })}
                      className="w-14 rounded border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-ember"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.category}
                      onChange={(e) => update(i, { category: e.target.value })}
                      className="rounded border border-line bg-surface px-2 py-1 text-xs outline-none focus:border-ember"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={r.grade}
                      onChange={(e) => update(i, { grade: e.target.value })}
                      className="rounded border border-line bg-surface px-2 py-1 font-mono text-xs outline-none focus:border-ember"
                    >
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={r.fgo_applied}
                      disabled={!cat?.fgo}
                      onChange={(e) => update(i, { fgo_applied: e.target.checked })}
                      title={cat?.fgo ? "Mark as already FGO'd" : "This category is FGO-ineligible"}
                      className="h-4 w-4 accent-ember disabled:opacity-30"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeRow(i)}
                      className="font-mono text-xs text-ash hover:text-bad"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <button onClick={addRow} className="rounded border border-line px-3 py-1.5 font-mono text-xs text-ash hover:border-ash">
          + course
        </button>
        <button onClick={computeCgpa} disabled={busy} className="rounded border border-line px-3 py-1.5 font-mono text-xs text-bone hover:border-ember disabled:opacity-40">
          compute CGPA
        </button>
        <button onClick={checkQuota} disabled={busy} className="rounded border border-line px-3 py-1.5 font-mono text-xs text-bone hover:border-ember disabled:opacity-40">
          FGO quota
        </button>
        <button onClick={suggest} disabled={busy} className="rounded bg-ember px-3 py-1.5 font-mono text-xs font-semibold text-canvas disabled:opacity-40">
          suggest courses to FGO →
        </button>
      </div>

      {err && (
        <p className="mt-4 rounded border border-bad/40 bg-bad/5 px-3 py-2 font-mono text-[11px] text-bad">
          {err}
        </p>
      )}

      {/* results */}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cgpa !== null && (
          <Panel label="Current CGPA">
            <p className="text-3xl font-semibold text-bone">{cgpa.toFixed(2)}</p>
          </Panel>
        )}
        {quota && (
          <Panel label="FGO quota (AU)">
            <p className="text-sm text-bone">
              {quota.used_total_au} / {quota.total_quota_au} used ·{" "}
              <span className="text-ash">{quota.remaining_total_au} left</span>
            </p>
            <p className="mt-1 font-mono text-[11px] text-ash">
              Core/MPE/ICC sub-cap: {quota.used_subcap_au} / {quota.subcap_quota_au}
            </p>
            {(quota.over_total || quota.over_subcap) && (
              <p className="mt-2 font-mono text-[11px] text-bad">Over cap — see warnings.</p>
            )}
          </Panel>
        )}
        {suggested && (
          <Panel label="Suggested to FGO">
            {suggested.length ? (
              <>
                <p className="font-mono text-sm text-ember">{suggested.join(" · ")}</p>
                <button
                  onClick={simulateSuggested}
                  disabled={busy}
                  className="mt-3 rounded border border-ember px-3 py-1 font-mono text-[11px] text-ember disabled:opacity-40"
                >
                  simulate these →
                </button>
              </>
            ) : (
              <p className="text-sm text-ash">No course drags your CGPA below its current value.</p>
            )}
          </Panel>
        )}
      </div>

      {sim && (
        <div className="mt-6 rounded-lg border border-line bg-surface p-5">
          <h2 className="font-mono text-xs uppercase tracking-widest text-ash">Simulation result</h2>
          <p className="mt-2 text-2xl font-semibold text-bone">
            {sim.cgpa_before.toFixed(2)} <span className="text-ash">→</span>{" "}
            <span className="text-ember">{sim.cgpa_after.toFixed(2)}</span>{" "}
            <span className="text-sm text-ash">
              ({sim.delta >= 0 ? "+" : ""}
              {sim.delta.toFixed(2)})
            </span>
          </p>
          {sim.blocked?.length > 0 && (
            <ul className="mt-3 space-y-1">
              {sim.blocked.map((b: string) => (
                <li key={b} className="font-mono text-[11px] text-bad">⊘ {b}</li>
              ))}
            </ul>
          )}
          {sim.warnings?.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3">
              {sim.warnings.map((w: string, i: number) => (
                <li key={i} className="font-mono text-[11px] text-warn">⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ash">{label}</p>
      {children}
    </div>
  );
}
