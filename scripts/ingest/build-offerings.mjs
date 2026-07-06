// =============================================================================
// build-offerings.mjs  —  offering records -> per-course snapshots + manifest
// =============================================================================
// Serving layer of the two-plane model (spec 2026-07-06). Writes one static
// JSON per course plus a manifest, mirroring the compiled-rulebook.json ethos
// and NTUMods' proven per-course CDN approach — the explorer fetches only what
// is on screen.
//
//   node scripts/ingest/build-offerings.mjs --from records.json --ay 2025-26 --sem 2
//
// `--from` is a JSON array of normalized offering records (see offerings.mjs).
// Live fetching straight from OWA is the follow-up (spec section 9); until then
// the pipeline runs from captured/normalized records. Snapshots are BUILD
// ARTIFACTS (regenerated each scan), stamped with `fetched_at`.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateOffering } from "./offerings.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..");

/**
 * PURE. records -> { perCourse: {CODE: snapshot}, manifest }.
 * @param {Array<{course, indexes}>} records
 */
export function buildSnapshots(records, { academicYear, semester, fetchedAt, source = "owa:aus_schedule" }) {
  const perCourse = {};
  for (const rec of records ?? []) {
    const err = validateOffering(rec);
    if (err) throw new Error(`invalid offering record: ${err}`);
    perCourse[rec.course] = {
      course: rec.course,
      academic_year: academicYear,
      semester,
      fetched_at: fetchedAt,
      source,
      indexes: rec.indexes,
    };
  }
  const courses = Object.keys(perCourse).sort();
  const manifest = { academic_year: academicYear, semester, fetched_at: fetchedAt, source, count: courses.length, courses };
  return { perCourse, manifest };
}

function writeSnapshots({ perCourse, manifest }, { academicYear, semester }) {
  const dir = join(REPO, "offerings", "ntu", `${academicYear}-s${semester}`);
  mkdirSync(dir, { recursive: true });
  for (const [code, snap] of Object.entries(perCourse)) {
    writeFileSync(join(dir, `${code}.json`), JSON.stringify(snap, null, 2) + "\n");
  }
  writeFileSync(join(dir, "_manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return dir;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
  const from = opt("--from");
  if (!from) throw new Error("pass --from <records.json> (a JSON array of normalized offering records)");
  const academicYear = opt("--ay", "2025-26");
  const semester = Number(opt("--sem", "2"));
  const source = opt("--source", "owa:aus_schedule");
  const fetchedAt = opt("--fetched-at", new Date().toISOString());

  const records = JSON.parse(readFileSync(from, "utf8"));
  const built = buildSnapshots(records, { academicYear, semester, fetchedAt, source });
  const dir = writeSnapshots(built, { academicYear, semester });
  console.log(`✓ wrote ${built.manifest.count} snapshot(s) + _manifest.json to ${dir}`);
}

if (process.argv[1] && process.argv[1].endsWith("build-offerings.mjs")) {
  try {
    main();
  } catch (err) {
    console.error("build-offerings failed:", err.message);
    process.exit(1);
  }
}
