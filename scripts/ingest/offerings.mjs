// =============================================================================
// offerings.mjs  —  normalize STARS course offerings into the offering model
// =============================================================================
// Artifact #2 of the two-plane model (spec 2026-07-06). Pure normalizers turn
// raw class-schedule rows (from OWA `aus_schedule` OR NTUMods' timetable) into
// the shared, clash-computable offering shape:
//
//   { course, indexes: [ { index, remark, slots: [
//       { type, group, day, start, end, venue, weeks } ] } ] }
//
// Both sources ultimately expose the SAME table columns (Index, Type, Group,
// Day, Time, Venue, Remark), so the real work lives in one core, rowsToIndexes,
// and each source is a thin adapter. Live fetching is a documented TODO — it
// needs a captured real sample (spec section 9) — but the transformation is
// real and golden-tested (ingest.test.mjs).
// =============================================================================

// POST-driven legacy endpoint; live wiring TODO (see spec section 9).
export const OWA_SCHEDULE_URL = "https://wis.ntu.edu.sg/webexe/owa/aus_schedule.main";
export const SLOT_TYPES = new Set(["LEC", "TUT", "LAB", "SEM", "DES", "PRJ", "WKSHOP"]);

/** Normalize a day token ("Monday"/"Mon"/"MON") to a 3-letter code, else null. */
export function normDay(s) {
  const k = String(s ?? "").trim().toUpperCase().slice(0, 3);
  return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].includes(k) ? k : null;
}

/** "0930-1120" / "0930 - 1120" / "800-0950" -> {start:"0930", end:"1120"}. */
export function parseTime(s) {
  const m = String(s ?? "").match(/(\d{3,4})\D+(\d{3,4})/);
  if (!m) return { start: null, end: null };
  const pad = (x) => x.padStart(4, "0");
  return { start: pad(m[1]), end: pad(m[2]) };
}

/** Extract a teaching-weeks string from a remark: "Teaching Wk1-13" -> "1-13". */
export function parseWeeks(remark) {
  const m = String(remark ?? "").match(/wk\s*([0-9]+(?:\s*[-,]\s*[0-9]+)*)/i);
  return m ? m[1].replace(/\s+/g, "") : null;
}

/** Uppercase + trim a class type; keep unknown types rather than dropping data. */
export function normType(s) {
  return String(s ?? "").trim().toUpperCase() || null;
}

/**
 * PURE CORE. Raw schedule rows -> grouped indexes.
 * OWA blanks the index cell on continuation rows, so we carry the last non-empty
 * index forward (this is why a naive per-row group would fragment an index).
 * @param {Array<{index,type,group,day,time,venue,remark}>} rows
 */
export function rowsToIndexes(rows) {
  const byIndex = new Map();
  let current = null;
  for (const r of rows ?? []) {
    const idx = String(r.index ?? "").trim();
    if (idx) current = idx; // carry-forward across blank continuation rows
    if (!current) continue; // ignore anything before the first index
    if (!byIndex.has(current)) byIndex.set(current, { index: current, remark: null, slots: [] });
    const entry = byIndex.get(current);
    if (entry.remark == null && r.remark) entry.remark = String(r.remark).trim();
    const { start, end } = parseTime(r.time);
    const slot = {
      type: normType(r.type),
      group: String(r.group ?? "").trim() || null,
      day: normDay(r.day),
      start,
      end,
      venue: String(r.venue ?? "").trim() || null,
      weeks: parseWeeks(r.remark),
    };
    // Drop rows that carry no schedulable info (stray/blank table rows).
    if (slot.day || slot.start || slot.venue) entry.slots.push(slot);
  }
  return [...byIndex.values()];
}

/** OWA adapter: parsed table rows for ONE course -> offering record. */
export function normalizeOwaSchedule(rows, { course }) {
  return { course: String(course ?? "").toUpperCase().trim(), indexes: rowsToIndexes(rows) };
}

/**
 * NTUMods adapter: one module object -> offering record. Accepts the common
 * key variants (Index/index/classNo, Type/type/lessonType, ...). The exact live
 * NTUMods shape must be confirmed (spec section 9); this maps the documented one.
 */
export function normalizeNtumodsTimetable(mod) {
  const course = String(mod?.code ?? mod?.CourseCode ?? mod?.moduleCode ?? "").toUpperCase().trim();
  const raw = mod?.schedule ?? mod?.lessons ?? mod?.timetable ?? [];
  const rows = raw.map((r) => ({
    index: r.index ?? r.Index ?? r.classNo ?? "",
    type: r.type ?? r.Type ?? r.lessonType ?? "",
    group: r.group ?? r.Group ?? "",
    day: r.day ?? r.Day ?? "",
    time: r.time ?? r.Time ?? (r.startTime && r.endTime ? `${r.startTime}-${r.endTime}` : ""),
    venue: r.venue ?? r.Venue ?? "",
    remark: r.remark ?? r.Remark ?? r.weeks ?? "",
  }));
  return { course, indexes: rowsToIndexes(rows) };
}

/** Light shape guard used by the builder before writing a snapshot. */
export function validateOffering(rec) {
  if (!rec || typeof rec.course !== "string" || !rec.course) return "missing course";
  if (!Array.isArray(rec.indexes)) return "indexes must be an array";
  return null;
}

// ---- live fetch (TODO: needs a captured real sample, spec section 9) --------
export async function fetchOwaSchedule() {
  throw new Error(
    "OWA live fetch not wired yet. Capture a real aus_schedule POST response " +
      "(params acadsem, r_course_yr, boption, r_subj_code), save as a fixture, " +
      "then parse rows and pass to normalizeOwaSchedule(). See spec section 9."
  );
}
