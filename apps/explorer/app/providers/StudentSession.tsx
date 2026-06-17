"use client";

// =============================================================================
// StudentSession — session-scoped persistence for the optimizer's working data.
//
// The optimizer (apps/explorer/app/optimizer/page.tsx) used to keep the parsed
// audit, editable course rows, and computed CGPA/FGO results in local React
// state — so everything was lost the moment the student navigated away. This
// Context backs that state with `sessionStorage`, which has exactly the right
// semantics for the ask:
//   • survives in-tab navigation AND reload, and
//   • is wiped when the tab/session ends.
//
// Nothing is ever sent to or persisted on a server. The audit lives in the
// browser only, for this session only (a PDPA win we surface in the UI).
//
// Hydration safety: Next 15 renders this on the server first, where there is no
// `sessionStorage`. We therefore SEED from constants on the server + first
// client render (so markup matches), then read sessionStorage lazily in an
// effect after mount and replace state if a stored session exists. This avoids
// the "text content did not match" hydration error.
// =============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { components } from "@/lib/engine-schema";

// Engine response types are GENERATED from the engine's OpenAPI schema
// (npm run types:engine) — single source of truth, so contract drift is a
// compile error. Re-export the ones the optimizer state holds.
export type FgoQuotaStatus = components["schemas"]["FgoQuotaStatus"];
export type FgoSimulation = components["schemas"]["FgoSimulation"];
export type AuditParseResult = components["schemas"]["AuditParseResult"];

// The editable course row, as shown in the optimizer table. This is the single
// definition — the optimizer imports `Row` from here so the two can't drift.
export type Row = {
  code: string;
  au: number;
  category: string;
  grade: string;
  fgo_applied: boolean;
};

// The initial table when nothing is stored. Kept here (not in the page) so the
// "is this the untouched seed?" check below has the canonical reference.
export const SEED: Row[] = [
  { code: "EE2101", au: 3, category: "CORE", grade: "A-", fgo_applied: false },
  { code: "EE2102", au: 3, category: "CORE", grade: "B+", fgo_applied: false },
  { code: "IE2108", au: 3, category: "CORE", grade: "B", fgo_applied: false },
  { code: "BDE101", au: 3, category: "BDE", grade: "C+", fgo_applied: false },
];

// sessionStorage key. Versioned so a future shape change can be migrated/ignored
// rather than crashing on a stale blob.
const STORAGE_KEY = "ntu-copilot/student-session/v1";

type Persisted = {
  parsed: AuditParseResult | null;
  rows: Row[];
  cgpa: number | null;
  quota: FgoQuotaStatus | null;
  suggested: string[] | null;
  sim: FgoSimulation | null;
};

const EMPTY: Persisted = {
  parsed: null,
  rows: SEED,
  cgpa: null,
  quota: null,
  suggested: null,
  sim: null,
};

export type StudentSession = {
  parsed: AuditParseResult | null;
  setParsed: (v: AuditParseResult | null) => void;
  rows: Row[];
  setRows: (v: Row[] | ((prev: Row[]) => Row[])) => void;
  cgpa: number | null;
  setCgpa: (v: number | null) => void;
  quota: FgoQuotaStatus | null;
  setQuota: (v: FgoQuotaStatus | null) => void;
  suggested: string[] | null;
  setSuggested: (v: string[] | null) => void;
  sim: FgoSimulation | null;
  setSim: (v: FgoSimulation | null) => void;
  /** true when there's any user data to lose (an upload, or rows edited off seed). */
  hasData: boolean;
  /** wipe context state + the sessionStorage key (resets the table to seed). */
  clear: () => void;
};

const Ctx = createContext<StudentSession | null>(null);

function rowsAreSeed(rows: Row[]): boolean {
  if (rows.length !== SEED.length) return false;
  return rows.every((r, i) => {
    const s = SEED[i];
    return (
      r.code === s.code &&
      r.au === s.au &&
      r.category === s.category &&
      r.grade === s.grade &&
      r.fgo_applied === s.fgo_applied
    );
  });
}

function readStored(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    // Defensive: fill any missing field from EMPTY so an older/partial blob
    // can't crash the optimizer.
    return {
      parsed: parsed.parsed ?? null,
      rows: Array.isArray(parsed.rows) ? parsed.rows : SEED,
      cgpa: parsed.cgpa ?? null,
      quota: parsed.quota ?? null,
      suggested: parsed.suggested ?? null,
      sim: parsed.sim ?? null,
    };
  } catch {
    return null;
  }
}

export function StudentSessionProvider({ children }: { children: ReactNode }) {
  // Seed deterministically so server + first client render produce identical
  // markup. sessionStorage is read AFTER mount (below), never during render.
  const [state, setState] = useState<Persisted>(EMPTY);

  // Don't write back to sessionStorage until we've hydrated from it — otherwise
  // the mount-time seed would clobber a real stored session.
  const hydrated = useRef(false);

  useEffect(() => {
    const stored = readStored();
    if (stored) setState(stored);
    hydrated.current = true;
  }, []);

  // Write-through: persist on every change once hydrated.
  useEffect(() => {
    if (!hydrated.current) return;
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full / unavailable (private mode quotas). Non-fatal: the
      // in-memory state still works for this navigation.
    }
  }, [state]);

  const setParsed = useCallback(
    (v: AuditParseResult | null) => setState((s) => ({ ...s, parsed: v })),
    []
  );
  const setRows = useCallback(
    (v: Row[] | ((prev: Row[]) => Row[])) =>
      setState((s) => ({
        ...s,
        rows: typeof v === "function" ? (v as (p: Row[]) => Row[])(s.rows) : v,
      })),
    []
  );
  const setCgpa = useCallback(
    (v: number | null) => setState((s) => ({ ...s, cgpa: v })),
    []
  );
  const setQuota = useCallback(
    (v: FgoQuotaStatus | null) => setState((s) => ({ ...s, quota: v })),
    []
  );
  const setSuggested = useCallback(
    (v: string[] | null) => setState((s) => ({ ...s, suggested: v })),
    []
  );
  const setSim = useCallback(
    (v: FgoSimulation | null) => setState((s) => ({ ...s, sim: v })),
    []
  );

  const clear = useCallback(() => {
    setState(EMPTY);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  const hasData = state.parsed !== null || !rowsAreSeed(state.rows);

  const value: StudentSession = {
    parsed: state.parsed,
    setParsed,
    rows: state.rows,
    setRows,
    cgpa: state.cgpa,
    setCgpa,
    quota: state.quota,
    setQuota,
    suggested: state.suggested,
    setSuggested,
    sim: state.sim,
    setSim,
    hasData,
    clear,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudentSession(): StudentSession {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useStudentSession must be used within a <StudentSessionProvider>"
    );
  }
  return ctx;
}
