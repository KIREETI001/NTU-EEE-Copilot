// =============================================================================
// ges.test.mjs  —  unit tests for the pure GES mapping/diff (node --test)
// =============================================================================
// Mirrors the engine's discipline: the pure functions get golden tests, run
// with the built-in runner (no dependency). Fixtures are trimmed from the REAL
// data.gov.sg response verified 2026-07-06, so this also guards the schema:
// if data.gov.sg renames a column, mapGesRecordsToSeries stops matching and a
// test goes red.
//
//   node --test scripts/audit/
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { mapGesRecordsToSeries, diffSeries, normalizeDegree } from "./ges.mjs";

// Real column names + shapes from the live API (values are strings; note the
// "And" case drift on the 2023 row, a non-NTU row, and a non-EEE NTU row).
const RECORDS = [
  { year: "2024", university: "Nanyang Technological University", degree: "Electrical and Electronic Engineering", employment_rate_overall: "79.3", employment_rate_ft_perm: "76.1", basic_monthly_mean: "4900", basic_monthly_median: "4700", gross_monthly_mean: "4824", gross_monthly_median: "4800", gross_mthly_25_percentile: "4200", gross_mthly_75_percentile: "5155" },
  { year: "2023", university: "Nanyang Technological University", degree: "Electrical And Electronic Engineering", employment_rate_overall: "87.1", employment_rate_ft_perm: "80.0", basic_monthly_mean: "4600", basic_monthly_median: "4500", gross_monthly_mean: "4700", gross_monthly_median: "4800", gross_mthly_25_percentile: "4100", gross_mthly_75_percentile: "5100" },
  { year: "2024", university: "National University of Singapore", degree: "Bachelor of Engineering (Electrical Engineering)", employment_rate_overall: "88.4", employment_rate_ft_perm: "85.0", basic_monthly_mean: "5000", basic_monthly_median: "5000", gross_monthly_mean: "5200", gross_monthly_median: "5000", gross_mthly_25_percentile: "4500", gross_mthly_75_percentile: "5600" },
  { year: "2024", university: "Nanyang Technological University", degree: "Mechanical Engineering", employment_rate_overall: "70.0", employment_rate_ft_perm: "65.0", basic_monthly_mean: "4400", basic_monthly_median: "4300", gross_monthly_mean: "4500", gross_monthly_median: "4400", gross_mthly_25_percentile: "4000", gross_mthly_75_percentile: "4800" },
  { year: "na", university: "Nanyang Technological University", degree: "Electrical and Electronic Engineering", employment_rate_overall: "na", employment_rate_ft_perm: "na", basic_monthly_mean: "na", basic_monthly_median: "na", gross_monthly_mean: "na", gross_monthly_median: "na", gross_mthly_25_percentile: "na", gross_mthly_75_percentile: "na" },
];

test("normalizeDegree folds case and ampersands", () => {
  assert.equal(normalizeDegree("Electrical And Electronic Engineering"), "electrical and electronic engineering");
  assert.equal(normalizeDegree("Electrical & Electronic  Engineering"), "electrical and electronic engineering");
});

test("mapGesRecordsToSeries filters to NTU EEE, sorts, maps, drops junk rows", () => {
  const series = mapGesRecordsToSeries(RECORDS);
  assert.equal(series.length, 2, "only the two valid NTU-EEE rows survive (NUS, Mechanical, na-year dropped)");
  assert.deepEqual(series.map((e) => e.year), [2023, 2024], "ascending by year");

  const y2024 = series.find((e) => e.year === 2024);
  assert.equal(y2024.currently_employed_pct, 79.3);
  assert.equal(y2024.full_time_permanent_pct, 76.1);
  assert.equal(y2024.gross_median_sgd, 4800);
  assert.equal(y2024.gross_mean_sgd, 4824);
  assert.equal(y2024.gross_p25_sgd, 4200);
  assert.equal(y2024.gross_p75_sgd, 5155);
  assert.equal(y2024.basic_median_sgd, 4700);
  // basic_monthly_mean has no rulebook field -> must not leak in
  assert.ok(!("basic_mean_sgd" in y2024));
  // no secured_employment_pct is ever synthesized (no API column for it)
  assert.ok(!("secured_employment_pct" in y2024));
});

test("diffSeries: identical overlap = no drift", () => {
  const api = mapGesRecordsToSeries(RECORDS);
  const stored = api.map((e) => ({ ...e })); // rulebook == API
  const d = diffSeries(stored, api);
  assert.equal(d.changed.length, 0);
  assert.equal(d.newerThanStored.length, 0);
  assert.equal(d.actionable, false);
});

test("diffSeries: older years the rulebook omits are info-only, NOT actionable", () => {
  const api = mapGesRecordsToSeries(RECORDS); // 2023, 2024
  const stored = api.filter((e) => e.year === 2024); // maintainer keeps only 2024
  const d = diffSeries(stored, api);
  assert.deepEqual(d.backfillAvailable, [2023]);
  assert.deepEqual(d.newerThanStored, []);
  assert.equal(d.actionable, false, "deliberately-omitted older years must not fail the audit");
});

test("diffSeries: a changed value is real, actionable drift", () => {
  const api = mapGesRecordsToSeries(RECORDS);
  const stored = api.map((e) => ({ ...e }));
  stored.find((e) => e.year === 2024).gross_median_sgd = 4700; // rulebook stale
  const d = diffSeries(stored, api);
  assert.equal(d.changed.length, 1);
  assert.deepEqual(d.changed[0], { year: 2024, field: "gross_median_sgd", stored: 4700, api: 4800 });
  assert.equal(d.actionable, true);
});

test("diffSeries: a PDF-sourced year newer than the API is expected, not drift", () => {
  const api = mapGesRecordsToSeries(RECORDS); // max year 2024
  const stored = [...api.map((e) => ({ ...e })), { year: 2025, currently_employed_pct: 83.3, full_time_permanent_pct: 75.8, gross_median_sgd: 4800, gross_mean_sgd: 4786, gross_p25_sgd: 4250, gross_p75_sgd: 5200, basic_median_sgd: 4640 }];
  const d = diffSeries(stored, api);
  assert.deepEqual(d.manualAhead, [2025]);
  assert.equal(d.actionable, false, "being ahead of the API is fine on its own");
});

test("diffSeries: a year newer than the rulebook's latest is actionable", () => {
  const api = mapGesRecordsToSeries(RECORDS); // 2023, 2024
  const stored = api.filter((e) => e.year === 2023); // rulebook's latest is 2023
  const d = diffSeries(stored, api);
  assert.deepEqual(d.newerThanStored, [2024]);
  assert.equal(d.actionable, true);
});
