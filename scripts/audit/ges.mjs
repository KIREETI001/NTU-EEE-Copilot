// =============================================================================
// ges.mjs  —  Graduate Employment Survey provider for the monthly auditor
// =============================================================================
// Source: data.gov.sg "Graduate Employment Survey (NTU/NUS/SIT/SMU/SUSS/SUTD)".
// Turns the government open-data rows into the rulebook's careers.yaml
// `graduate_employment_survey.series` shape, and DIFFS the live API against
// what the rulebook currently stores.
//
// The one rule (see CLAUDE.md): this NEVER writes the rulebook. It reports and
// proposes. A human reviews the diff and commits — Git stays the changelog.
//
// Verified against the live API 2026-07-06:
//   - resource_id d_3c55210de27fcccda2ed0c63fdd2b352, columns below.
//   - Latest year present = 2024. The rulebook's 2025 row is PDF-sourced (the
//     MOE GES report leads data.gov.sg by ~1 cycle), so a stored year NEWER than
//     the API's max is EXPECTED, not drift — see diffSeries().
//   - NTU EEE 2024 API row (employment_rate_overall 79.3, gross median 4800)
//     matches the hand-transcribed careers.yaml exactly.
// =============================================================================

import { fetchAllRecords } from "./datagovsg.mjs";

export const GES_RESOURCE_ID = "d_3c55210de27fcccda2ed0c63fdd2b352";
export const NTU = "Nanyang Technological University";

// Default target for the EEE pilot. To generate careers for another programme,
// pass a different `degreeMatch` (already normalized) — this is the multi-school
// lever: the mapping is programme-agnostic.
export const EEE_DEGREE_MATCH = "electrical and electronic engineering";

// data.gov.sg column  ->  careers.yaml series key. `basic_monthly_mean` exists in
// the source but the rulebook schema does not carry it, so it is intentionally
// dropped. `secured_employment_pct` is a rulebook-only field (from the GES PDF's
// "secured vs currently employed" split) with no API column — never synthesized.
const FIELD_MAP = [
  ["employment_rate_overall", "currently_employed_pct", "float"],
  ["employment_rate_ft_perm", "full_time_permanent_pct", "float"],
  ["gross_monthly_median", "gross_median_sgd", "int"],
  ["gross_monthly_mean", "gross_mean_sgd", "int"],
  ["gross_mthly_25_percentile", "gross_p25_sgd", "int"],
  ["gross_mthly_75_percentile", "gross_p75_sgd", "int"],
  ["basic_monthly_median", "basic_median_sgd", "int"],
];

/** Normalize a degree string so "Electrical And Electronic Engineering",
 *  "Electrical & Electronic Engineering" etc. all compare equal. */
export function normalizeDegree(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}

function num(raw, kind) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "" || /^(na|n\.a\.?|-|nil)$/i.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return kind === "int" ? Math.round(n) : n;
}

/**
 * PURE. Map raw API records -> sorted series entries for one programme.
 * Filters to `university` + normalized `degreeMatch`, de-dupes by year (last
 * row wins), sorts ascending. Returns [{year, currently_employed_pct, ...}].
 */
export function mapGesRecordsToSeries(records, { university = NTU, degreeMatch = EEE_DEGREE_MATCH } = {}) {
  const byYear = new Map();
  for (const r of records) {
    if (r.university !== university) continue;
    if (normalizeDegree(r.degree) !== degreeMatch) continue;
    const year = num(r.year, "int");
    if (year == null) continue;
    const entry = { year };
    for (const [col, key, kind] of FIELD_MAP) entry[key] = num(r[col], kind);
    byYear.set(year, entry); // last occurrence wins if the source ever dupes
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

function eq(a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-9;
}

/**
 * PURE. Compare the rulebook's stored series against the freshly mapped API
 * series. A FRESHNESS auditor only barks at genuinely new data or real drift —
 * NOT at older years the maintainer deliberately chose not to store. So:
 *   - changed          value disagreement on a shared year        -> ACTIONABLE
 *   - newerThanStored  API year newer than the rulebook's latest  -> ACTIONABLE
 *   - backfillAvailable older API year the rulebook simply omits   -> info only
 *   - manualAhead      rulebook year newer than the API (PDF-led)  -> info only
 */
export function diffSeries(storedSeries = [], apiSeries = []) {
  const stored = new Map(storedSeries.map((e) => [e.year, e]));
  const api = new Map(apiSeries.map((e) => [e.year, e]));
  const apiYears = [...api.keys()];
  const storedYears = [...stored.keys()];
  const maxApiYear = apiYears.length ? Math.max(...apiYears) : -Infinity;
  const maxStoredYear = storedYears.length ? Math.max(...storedYears) : -Infinity;

  const changed = [];
  const newerThanStored = [];
  const backfillAvailable = [];
  const manualAhead = [];

  for (const [year, apiEntry] of api) {
    const s = stored.get(year);
    if (!s) {
      if (year > maxStoredYear) newerThanStored.push(year);
      else backfillAvailable.push(year);
      continue;
    }
    for (const [, key] of FIELD_MAP) {
      if (!eq(s[key], apiEntry[key])) {
        changed.push({ year, field: key, stored: s[key] ?? null, api: apiEntry[key] ?? null });
      }
    }
  }
  for (const year of stored.keys()) {
    if (year > maxApiYear) manualAhead.push(year);
  }

  const actionable = changed.length > 0 || newerThanStored.length > 0;
  return {
    changed,
    newerThanStored: newerThanStored.sort((a, b) => a - b),
    backfillAvailable: backfillAvailable.sort((a, b) => a - b),
    manualAhead: manualAhead.sort((a, b) => a - b),
    actionable,
    maxApiYear: Number.isFinite(maxApiYear) ? maxApiYear : null,
    maxStoredYear: Number.isFinite(maxStoredYear) ? maxStoredYear : null,
  };
}

/** IMPURE. Fetch + map the live GES series for one programme. */
export async function fetchGesSeries({
  resource = GES_RESOURCE_ID,
  university = NTU,
  degreeMatch = EEE_DEGREE_MATCH,
} = {}) {
  // Server-side filter by university (exact + stable); degree is matched client
  // side because the source has case drift ("and" vs "And") the API won't fold.
  const { records } = await fetchAllRecords(resource, { filters: { university } });
  return mapGesRecordsToSeries(records, { university, degreeMatch });
}

/** PURE. Render a paste-ready YAML block for the `series:` list. */
export function toYamlSeriesBlock(series) {
  const keyOrder = ["year", ...FIELD_MAP.map(([, k]) => k)];
  const lines = ["series:"];
  for (const e of series) {
    lines.push(`  - year: ${e.year}`);
    for (const k of keyOrder) {
      if (k === "year") continue;
      const v = e[k];
      lines.push(`    ${k}: ${v == null ? "null" : v}`);
    }
  }
  return lines.join("\n") + "\n";
}
