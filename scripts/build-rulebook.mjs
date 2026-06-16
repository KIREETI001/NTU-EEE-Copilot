// =============================================================================
// build-rulebook.mjs  —  compile rulebook/**/<cohort>/*.yaml  ->  one JSON file
// =============================================================================
// The YAML is the human-editable source of truth (Git = changelog). The
// explorer is a static-ish reader, so we COMPILE to a single JSON artifact at
// apps/explorer/public/rulebook.json. One source, two consumers (Python engine
// reads YAML directly; Next.js reads this JSON). Run on build + on rulebook edit.
//
//   node scripts/build-rulebook.mjs
// =============================================================================

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const RULEBOOK = join(REPO, "rulebook");
const OUT = join(REPO, "apps", "explorer", "public", "rulebook.json");

const FILES = ["meta", "degree", "grading", "specializations", "admissions", "careers"];

function dirs(p) {
  return readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory());
}

const cohorts = {};
for (const uni of dirs(RULEBOOK).filter((d) => d !== "schema")) {
  for (const prog of dirs(join(RULEBOOK, uni))) {
    for (const cohort of dirs(join(RULEBOOK, uni, prog))) {
      const base = join(RULEBOOK, uni, prog, cohort);
      const key = `${uni}/${prog}/${cohort}`;
      const bundle = {};
      for (const name of FILES) {
        const f = join(base, `${name}.yaml`);
        try {
          bundle[name] = parse(readFileSync(f, "utf8"));
        } catch {
          /* file may not exist for every cohort */
        }
      }
      cohorts[key] = bundle;
    }
  }
}

const payload = {
  generated_at: new Date().toISOString(),
  cohorts,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`✓ wrote ${OUT}`);
console.log(`  cohorts: ${Object.keys(cohorts).join(", ")}`);
