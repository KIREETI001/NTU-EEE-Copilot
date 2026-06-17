// =============================================================================
// validate-rulebook.mjs  —  fail-fast invariant + provenance checks
// =============================================================================
// The rulebook is the single source of truth for academic facts; nothing should
// stop a malformed or internally-inconsistent rulebook from shipping. This is
// that gate. Run by `npm run rulebook:validate` and in CI. Exit 1 on any error.
//
// Checks (per cohort):
//   - the four liability-critical files parse
//   - every `confidence` / `*_confidence` value is in the allowed vocabulary
//   - meta carries schema_version + at least one source (each with a url)
//   - degree category AU sum == total_au.value
//   - honours bands are contiguous (one 0.01 step) and non-overlapping
//   - grading.fgo.ineligible_courses covers every degree fgo_eligible:false code
// =============================================================================

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULEBOOK = join(__dirname, "..", "rulebook");
const CONF_VOCAB = new Set(["verified", "outdated", "unverified"]);

const errors = [];
const fail = (cohort, msg) => errors.push(`[${cohort}] ${msg}`);

function subdirs(p) {
  return readdirSync(p).filter(
    (d) => statSync(join(p, d)).isDirectory() && d !== "schema"
  );
}

function walkConfidence(node, path, cohort) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkConfidence(v, `${path}[${i}]`, cohort));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if ((k === "confidence" || k.endsWith("_confidence")) && typeof v === "string") {
        if (!CONF_VOCAB.has(v)) {
          fail(cohort, `${path}.${k} = "${v}" not in {verified,outdated,unverified}`);
        }
      }
      walkConfidence(v, `${path}.${k}`, cohort);
    }
  }
}

for (const uni of subdirs(RULEBOOK)) {
  for (const prog of subdirs(join(RULEBOOK, uni))) {
    for (const cohort of subdirs(join(RULEBOOK, uni, prog))) {
      const base = join(RULEBOOK, uni, prog, cohort);
      const key = `${uni}/${prog}/${cohort}`;
      const load = (name) => {
        try {
          return parse(readFileSync(join(base, `${name}.yaml`), "utf8"));
        } catch {
          return null;
        }
      };

      const docs = {
        meta: load("meta"),
        degree: load("degree"),
        grading: load("grading"),
        specializations: load("specializations"),
        admissions: load("admissions"),
        careers: load("careers"),
      };

      // 1. the four liability-critical files must parse
      for (const name of ["meta", "degree", "grading", "specializations"]) {
        if (!docs[name]) fail(key, `missing or unparseable ${name}.yaml`);
      }

      // 2. confidence vocabulary (all files)
      for (const [name, doc] of Object.entries(docs)) {
        if (doc) walkConfidence(doc, name, key);
      }

      // 3. meta provenance
      const meta = docs.meta;
      if (meta) {
        if (!meta.schema_version) fail(key, "meta.schema_version missing");
        const sources = meta.sources || {};
        if (Object.keys(sources).length === 0) fail(key, "meta.sources is empty");
        for (const [s, v] of Object.entries(sources)) {
          if (!v || !v.url) fail(key, `meta.sources.${s} has no url`);
        }
      }

      // 4. degree: category AU sum == total
      const degree = docs.degree;
      if (degree) {
        const total = degree.total_au?.value;
        const sum = (degree.categories || []).reduce((a, c) => a + (c.au || 0), 0);
        if (typeof total === "number" && sum !== total) {
          fail(key, `category AU sum ${sum} != total_au.value ${total}`);
        }
      }

      // 5. grading: gpa scale present + honours bands contiguous/non-overlapping
      const grading = docs.grading;
      if (grading) {
        const grades = grading.gpa_scale?.grades;
        if (!grades || typeof grades !== "object") {
          fail(key, "grading.gpa_scale.grades missing");
        }
        const bands = grading.honours?.classes || [];
        for (let i = 0; i < bands.length - 1; i++) {
          const gapCents = Math.round((bands[i].min_cgpa - bands[i + 1].max_cgpa) * 100);
          if (gapCents <= 0) {
            fail(key, `honours bands overlap: "${bands[i].name}" min ${bands[i].min_cgpa} <= "${bands[i + 1].name}" max ${bands[i + 1].max_cgpa}`);
          } else if (gapCents > 1) {
            fail(key, `honours bands gap: "${bands[i].name}" min ${bands[i].min_cgpa} leaves a gap above "${bands[i + 1].name}" max ${bands[i + 1].max_cgpa}`);
          }
        }
      }

      // 6. FGO ineligibility drift guard (degree flags vs grading list)
      if (degree && grading) {
        const flagged = (degree.key_courses || [])
          .filter((k) => k.fgo_eligible === false)
          .map((k) => k.code);
        const listed = new Set(grading.fgo?.ineligible_courses || []);
        for (const code of flagged) {
          if (!listed.has(code)) {
            fail(key, `degree flags ${code} fgo_eligible:false but grading.fgo.ineligible_courses omits it`);
          }
        }
      }

      // 7. Course-title consistency: a code must carry ONE title everywhere it
      // appears. This is the canonical-course-table goal (no same-code-different-
      // title drift) enforced WITHOUT a separate table — catches e.g.
      // "Intelligent System(s) Design" or "& vs and Systems".
      const titlesByCode = {};
      const collect = (code, title) => {
        if (!code || !title) return;
        (titlesByCode[code] ||= new Set()).add(title);
      };
      for (const spec of docs.specializations?.specializations || []) {
        for (const c of spec.design_electives || []) collect(c.code, c.title);
        for (const c of spec.technical_electives || []) collect(c.code, c.title);
      }
      for (const kc of degree?.key_courses || []) collect(kc.code, kc.name);
      for (const [code, titles] of Object.entries(titlesByCode)) {
        if (titles.size > 1) {
          fail(key, `course ${code} has divergent titles: ${[...titles].map((t) => JSON.stringify(t)).join(" vs ")}`);
        }
      }
    }
  }
}

if (errors.length) {
  console.error(`✗ rulebook validation FAILED (${errors.length} error(s)):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("✓ rulebook validation passed");
