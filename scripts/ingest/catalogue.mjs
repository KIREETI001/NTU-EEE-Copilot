// =============================================================================
// catalogue.mjs  —  canonical NTU course catalogue (code -> title) ingest
// =============================================================================
// Artifact #1 of the two-plane model (see
// docs/superpowers/specs/2026-07-06-course-offering-foundation-design.md):
// the shared course vocabulary. Committed + reviewable — these are academic
// facts. Distinct from the volatile OFFERING plane (indexes/slots).
//
// Bootstrap source: a public NTUMods-style code->title map (all NTU courses).
// Durable source of record will be the OWA subject listing; AU/school are left
// null until backfilled from the handbook/OWA (see spec §9).
//
//   node scripts/ingest/catalogue.mjs            # fetch + write courses.json
//   node scripts/ingest/catalogue.mjs --ay 2025-26
//
// Deterministic output (sorted codes) so `git diff` on the catalogue is a real,
// reviewable change signal — same discipline as the compiled rulebook.json.
// =============================================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..", "..");

// Public code->title map (bootstrap). Overridable via CATALOGUE_URL for when
// the durable OWA-derived source is wired.
export const CATALOGUE_URL =
  process.env.CATALOGUE_URL ||
  "https://raw.githubusercontent.com/tjunxiang92/NTU-Timetable-Generator/master/timetable/modules.json";

const CODE_RE = /^[A-Z]{2,3}\d{3,4}[A-Z]?$/; // EE2010, CZ1007, MH1810, EE4080 ...

/** PURE. Normalize a raw {code: title} map into the committed catalogue shape. */
export function normalizeCatalogue(raw, { academicYear = "2025-26", generatedFrom = "ntumods:code-title" } = {}) {
  const courses = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    const code = String(k).toUpperCase().trim();
    if (!CODE_RE.test(code)) continue; // drop headers / non-course keys
    const title = String(v ?? "").replace(/\s+/g, " ").trim();
    if (!title) continue;
    courses[code] = { title, au: null, school: null };
  }
  // Deterministic: rebuild the object with sorted keys.
  const sorted = {};
  for (const code of Object.keys(courses).sort()) sorted[code] = courses[code];
  return { generated_from: generatedFrom, academic_year: academicYear, count: Object.keys(sorted).length, courses: sorted };
}

/** IMPURE. Fetch the bootstrap code->title map. */
export async function fetchCatalogueRaw(url = CATALOGUE_URL) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`catalogue source HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const args = process.argv.slice(2);
  let ay = "2025-26";
  const ayIdx = args.indexOf("--ay");
  if (ayIdx >= 0) {
    ay = args[ayIdx + 1];
    if (!ay || ay.startsWith("--")) {
      throw new Error("--ay requires a value, e.g. --ay 2025-26");
    }
  }
  const raw = await fetchCatalogueRaw();
  const catalogue = normalizeCatalogue(raw, { academicYear: ay });
  const out = join(REPO, "catalogue", "ntu", `ay${ay}`, "courses.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(catalogue, null, 2) + "\n");
  console.log(`✓ wrote ${out}`);
  console.log(`  ${catalogue.count} courses`);
}

// Run as CLI only (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("catalogue.mjs")) {
  main().catch((err) => {
    console.error("catalogue ingest failed:", err.message);
    process.exit(1);
  });
}
