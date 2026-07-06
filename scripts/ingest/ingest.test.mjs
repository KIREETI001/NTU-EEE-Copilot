// =============================================================================
// ingest.test.mjs  —  golden tests for the catalogue + offerings pipeline
// =============================================================================
// Same discipline as the engine + the GES auditor: pure functions get golden
// tests with the built-in runner (no dependency). Fixtures encode the REAL
// source shapes (NTUMods code->title map; the OWA/NTUMods class-schedule table
// columns), so a source-schema drift turns a test red.
//
//   node --test scripts/ingest/
// =============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeCatalogue } from "./catalogue.mjs";
import {
  parseTime,
  parseWeeks,
  normDay,
  rowsToIndexes,
  normalizeOwaSchedule,
  normalizeNtumodsTimetable,
} from "./offerings.mjs";
import { buildSnapshots } from "./build-offerings.mjs";

// --- catalogue ---------------------------------------------------------------

test("normalizeCatalogue keeps course codes, drops non-course keys, sorts", () => {
  const raw = { EE2010: "Signals and Systems", "cz1007": "Data Structures", "SOME HEADER": "x", "": "y" };
  const cat = normalizeCatalogue(raw, { academicYear: "2025-26" });
  assert.deepEqual(Object.keys(cat.courses), ["CZ1007", "EE2010"], "uppercased + sorted; header dropped");
  assert.equal(cat.courses.EE2010.title, "Signals and Systems");
  assert.equal(cat.courses.EE2010.au, null);
  assert.equal(cat.count, 2);
  assert.equal(cat.academic_year, "2025-26");
});

// --- slot parsing helpers ----------------------------------------------------

test("parseTime handles ranges and short hours", () => {
  assert.deepEqual(parseTime("0930-1120"), { start: "0930", end: "1120" });
  assert.deepEqual(parseTime("0930 - 1120"), { start: "0930", end: "1120" });
  assert.deepEqual(parseTime("800-0950"), { start: "0800", end: "0950" });
  assert.deepEqual(parseTime(""), { start: null, end: null });
});

test("parseWeeks extracts teaching weeks from a remark", () => {
  assert.equal(parseWeeks("Teaching Wk1-13"), "1-13");
  assert.equal(parseWeeks("Wk1,3,5,7,9,11,13"), "1,3,5,7,9,11,13");
  assert.equal(parseWeeks("no week info"), null);
});

test("normDay normalizes and rejects junk", () => {
  assert.equal(normDay("Monday"), "MON");
  assert.equal(normDay("tue"), "TUE");
  assert.equal(normDay("Funday"), null);
});

// --- the core: rows -> indexes ----------------------------------------------

// Real OWA table shape: the index cell is blank on continuation rows.
const OWA_ROWS = [
  { index: "10112", type: "LEC", group: "SGL", day: "MON", time: "0930-1120", venue: "LT1A", remark: "Teaching Wk1-13" },
  { index: "", type: "TUT", group: "SG1", day: "WED", time: "1330-1420", venue: "TR+15", remark: "Teaching Wk2-13" },
  { index: "10113", type: "LEC", group: "SGL", day: "MON", time: "0930-1120", venue: "LT1A", remark: "Teaching Wk1-13" },
  { index: "", type: "LAB", group: "SG5", day: "FRI", time: "0830-1120", venue: "Lab2", remark: "Teaching Wk3,5,7,9,11" },
];

test("rowsToIndexes carries the index forward across blank rows and parses slots", () => {
  const idx = rowsToIndexes(OWA_ROWS);
  assert.equal(idx.length, 2, "two indexes despite blank continuation rows");
  const i0 = idx.find((x) => x.index === "10112");
  assert.equal(i0.slots.length, 2, "LEC + carried-forward TUT");
  assert.deepEqual(i0.slots[0], { type: "LEC", group: "SGL", day: "MON", start: "0930", end: "1120", venue: "LT1A", weeks: "1-13" });
  assert.equal(i0.slots[1].type, "TUT");
  assert.equal(i0.slots[1].weeks, "2-13");
  const i1 = idx.find((x) => x.index === "10113");
  assert.equal(i1.slots[1].type, "LAB");
  assert.equal(i1.slots[1].weeks, "3,5,7,9,11");
});

test("normalizeOwaSchedule wraps rows into a course offering record", () => {
  const rec = normalizeOwaSchedule(OWA_ROWS, { course: "ee2010" });
  assert.equal(rec.course, "EE2010");
  assert.equal(rec.indexes.length, 2);
});

test("OWA and NTUMods sources normalize to the SAME indexes (cross-source agreement)", () => {
  // NTUMods module carrying the same two indexes, key-variant fields.
  const mod = {
    code: "EE2010",
    schedule: [
      { Index: "10112", Type: "LEC", Group: "SGL", Day: "MON", Time: "0930-1120", Venue: "LT1A", Remark: "Teaching Wk1-13" },
      { Index: "", Type: "TUT", Group: "SG1", Day: "WED", Time: "1330-1420", Venue: "TR+15", Remark: "Teaching Wk2-13" },
      { Index: "10113", Type: "LEC", Group: "SGL", Day: "MON", Time: "0930-1120", Venue: "LT1A", Remark: "Teaching Wk1-13" },
      { Index: "", Type: "LAB", Group: "SG5", Day: "FRI", Time: "0830-1120", Venue: "Lab2", Remark: "Teaching Wk3,5,7,9,11" },
    ],
  };
  const fromOwa = normalizeOwaSchedule(OWA_ROWS, { course: "EE2010" });
  const fromNtumods = normalizeNtumodsTimetable(mod);
  assert.deepEqual(fromNtumods, fromOwa, "two independent sources must agree after normalization");
});

// --- build -------------------------------------------------------------------

test("buildSnapshots produces per-course snapshots + a sorted manifest", () => {
  const records = [
    normalizeOwaSchedule(OWA_ROWS, { course: "EE2010" }),
    normalizeOwaSchedule([{ index: "20001", type: "LEC", day: "TUE", time: "1030-1220", venue: "LT2", remark: "Wk1-13" }], { course: "CZ1007" }),
  ];
  const { perCourse, manifest } = buildSnapshots(records, { academicYear: "2025-26", semester: 2, fetchedAt: "2026-07-06T09:00:00Z", source: "owa:aus_schedule" });
  assert.deepEqual(manifest.courses, ["CZ1007", "EE2010"], "manifest lists sorted codes");
  assert.equal(manifest.count, 2);
  assert.equal(manifest.fetched_at, "2026-07-06T09:00:00Z");
  assert.equal(perCourse.EE2010.academic_year, "2025-26");
  assert.equal(perCourse.EE2010.semester, 2);
  assert.equal(perCourse.EE2010.fetched_at, "2026-07-06T09:00:00Z");
  assert.equal(perCourse.EE2010.indexes.length, 2);
});

test("buildSnapshots rejects a malformed record", () => {
  assert.throws(() => buildSnapshots([{ indexes: [] }], { academicYear: "2025-26", semester: 2, fetchedAt: "x" }), /missing course/);
});
