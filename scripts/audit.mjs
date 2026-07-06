// =============================================================================
// audit.mjs  —  monthly rulebook auditor (the one meta.yaml has always named)
// =============================================================================
// Walks every cohort in rulebook/, and for each source in meta.yaml:
//   - graduate_employment_survey -> pulls the live data.gov.sg GES series and
//     DIFFS it against careers.yaml (structured value diff, not raw HTML).
//   - other sources -> a shallow HTTP freshness signal (Last-Modified vs
//     the recorded source_date).
//
// It NEVER edits the rulebook. It prints a report, proposes the next audit date,
// and (with --emit) prints a paste-ready careers.yaml series block. A human
// reviews and commits — Git stays the changelog. This is the "propose a diff,
// never auto-merge" contract from CLAUDE.md, made real.
//
//   node scripts/audit.mjs                       # audit every cohort
//   node scripts/audit.mjs --cohort ntu/eee/ay2025-26
//   node scripts/audit.mjs --emit                # also print fresh GES YAML
//   node scripts/audit.mjs --no-network          # structure only, offline
//   node scripts/audit.mjs --json                # machine-readable report
//
// Exit code 1 if any actionable GES drift (new year or changed value) is found,
// so a scheduled run / CI job can turn a red build into a review PR.
// =============================================================================

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  fetchGesSeries,
  diffSeries,
  toYamlSeriesBlock,
  normalizeDegree,
} from "./audit/ges.mjs";
import { checkFreshness } from "./audit/freshness.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULEBOOK = join(__dirname, "..", "rulebook");

// university code -> the exact string the GES dataset uses (NOT meta's
// university_full, which carries a ", Singapore" suffix the API lacks).
const UNI_API_NAME = { ntu: "Nanyang Technological University" };
// programme code -> normalized GES degree string, when the parenthetical guess
// isn't reliable. EEE is the pilot; others fall through to programme_full.
const PROGRAMME_DEGREE = { eee: "electrical and electronic engineering" };

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const ONLY = opt("--cohort");
const EMIT = has("--emit");
const JSON_OUT = has("--json");
const NO_NET = has("--no-network");
const DEGREE_OVERRIDE = opt("--degree");

function subdirs(p) {
  return readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory() && d !== "schema");
}
function load(base, name) {
  try {
    return parse(readFileSync(join(base, `${name}.yaml`), "utf8"));
  } catch {
    return null;
  }
}
function degreeMatchFor(meta) {
  if (DEGREE_OVERRIDE) return normalizeDegree(DEGREE_OVERRIDE);
  const prog = meta?.cohort?.programme;
  if (prog && PROGRAMME_DEGREE[prog]) return PROGRAMME_DEGREE[prog];
  const paren = String(meta?.cohort?.programme_full ?? "").match(/\(([^)]+)\)/);
  if (paren) return normalizeDegree(paren[1]);
  return prog ? normalizeDegree(prog) : null;
}
// Auditor cadence is monthly; propose one month out without pulling in a date
// library. (Plain Date is fine here — this is a CLI, not a workflow script.)
function plusOneMonthISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function discoverCohorts() {
  if (ONLY) {
    const [uni, prog, cohort] = ONLY.split("/");
    return [{ key: ONLY, base: join(RULEBOOK, uni, prog, cohort) }];
  }
  const out = [];
  for (const uni of subdirs(RULEBOOK))
    for (const prog of subdirs(join(RULEBOOK, uni)))
      for (const cohort of subdirs(join(RULEBOOK, uni, prog)))
        out.push({ key: `${uni}/${prog}/${cohort}`, base: join(RULEBOOK, uni, prog, cohort) });
  return out;
}

async function auditGes(meta, careers) {
  const stored = careers?.graduate_employment_survey?.series ?? [];
  const university = UNI_API_NAME[meta?.cohort?.university] ?? null;
  const degreeMatch = degreeMatchFor(meta);
  if (!university || !degreeMatch) {
    return { status: "skipped", note: `no GES mapping for ${meta?.cohort?.university}/${meta?.cohort?.programme}` };
  }
  if (NO_NET) return { status: "skipped", note: "network disabled (--no-network)" };
  try {
    const api = await fetchGesSeries({ university, degreeMatch });
    const diff = diffSeries(stored, api);
    return { status: "ok", api, diff, storedLatest: stored.at(-1)?.year ?? null };
  } catch (err) {
    return { status: "unreachable", note: err?.message ?? "fetch failed" };
  }
}

function printGes(g) {
  if (g.status === "skipped") return console.log(`  GES (data.gov.sg)      skipped — ${g.note}`);
  if (g.status === "unreachable") return console.log(`  GES (data.gov.sg)      ⚠ unreachable — ${g.note}`);
  const { diff, api, storedLatest } = g;
  console.log(`  GES (data.gov.sg)      API latest ${diff.maxApiYear ?? "?"} · rulebook latest ${storedLatest ?? "none"}`);
  if (diff.changed.length === 0) console.log("    ✓ overlapping years match the API");
  for (const c of diff.changed)
    console.log(`    ✗ drift ${c.year}.${c.field}: rulebook ${c.stored} vs API ${c.api}`);
  if (diff.newerThanStored.length) console.log(`    ⚠ NEW year(s) published since the rulebook's latest: ${diff.newerThanStored.join(", ")}`);
  if (diff.manualAhead.length) console.log(`    · rulebook ahead of API (PDF-sourced, expected): ${diff.manualAhead.join(", ")}`);
  if (diff.backfillAvailable.length) console.log(`    · older API year(s) available if you want deeper history: ${diff.backfillAvailable.join(", ")}`);
  if (EMIT && (diff.actionable || diff.changed.length)) {
    console.log("\n    ── proposed careers.yaml graduate_employment_survey.series (review before commit) ──");
    console.log(
      toYamlSeriesBlock(api)
        .split("\n")
        .map((l) => (l ? "    " + l : l))
        .join("\n")
    );
  }
}

async function main() {
  const report = { run: new Date().toISOString().slice(0, 10), keyPresent: !!process.env.DATA_GOV_SG_API_KEY, cohorts: [] };
  let actionable = false;

  if (!JSON_OUT) {
    console.log("NTU Academic Co-Pilot — rulebook auditor");
    console.log(`run: ${report.run}   data.gov.sg key: ${report.keyPresent ? "present" : "absent (public rate limit)"}\n`);
  }

  for (const { key, base } of discoverCohorts()) {
    const meta = load(base, "meta");
    const careers = load(base, "careers");
    const ges = await auditGes(meta, careers);
    if (ges.status === "ok" && ges.diff.actionable) actionable = true;

    const sources = meta?.sources ?? {};
    const freshness = {};
    for (const [name, src] of Object.entries(sources)) {
      if (name === "graduate_employment_survey") continue; // handled by GES provider
      freshness[name] = NO_NET ? { status: "skipped", note: "network disabled" } : await checkFreshness(src);
      if (freshness[name].status === "changed") actionable = true;
    }

    const proposedNext = plusOneMonthISO();
    report.cohorts.push({ key, ges, freshness, currentNextAuditDue: meta?.status?.next_audit_due ?? null, proposedNextAuditDue: proposedNext });

    if (!JSON_OUT) {
      console.log(`▸ ${key}`);
      printGes(ges);
      for (const [name, f] of Object.entries(freshness)) {
        const sym = { fresh: "✓", changed: "✗", manual: "·", unknown: "·", unreachable: "⚠", skipped: "·" }[f.status] ?? "·";
        console.log(`  ${name.padEnd(22)} ${sym} ${f.status} — ${f.note}`);
      }
      console.log(`  next_audit_due: rulebook says ${meta?.status?.next_audit_due ?? "—"}; suggest ${proposedNext}\n`);
    }
  }

  if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
  else console.log(actionable ? "✗ actionable drift found — review and open a rulebook PR." : "✓ no actionable drift.");
  process.exit(actionable ? 1 : 0);
}

main().catch((err) => {
  console.error("auditor crashed:", err);
  process.exit(2);
});
