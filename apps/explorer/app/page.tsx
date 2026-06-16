import Link from "next/link";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import {
  getSpecializations,
  getDegree,
  getAdmissions,
  getCareers,
  getRecognitionRules,
} from "@/lib/rulebook";

export default function Home() {
  const specs = getSpecializations();
  const degree = getDegree();
  const adm = getAdmissions();
  const careers = getCareers();
  const rules = getRecognitionRules();
  const ges2025 = careers.graduate_employment_survey.series.find((s: any) => s.year === 2025);

  return (
    <div>
      {/* hero — leads with the single most characteristic decision an EEE student faces */}
      <section className="mb-14">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-ember">
          NTU Electrical &amp; Electronic Engineering
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">
          Eight specializations.<br />
          One <span className="text-ember">irreversible</span> set of choices.
        </h1>
        <p className="mt-5 max-w-2xl text-ash">
          Research every EEE specialization, what it requires, and where it leads —
          anchored to a version-tracked rulebook, not a forum post. For current
          undergrads and prospective students deciding if this is their path.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
          <Stat k="degree AU" v={String(degree.total_au.value)} sub="across 4 years" />
          <Stat k="specializations" v={String(specs.length)} sub={`${rules.min_au_single_area} AU to claim one`} />
          <Stat k="median salary" v={`S$${ges2025?.gross_median_sgd?.toLocaleString()}`} sub="GES 2025, fresh grad" />
          <Stat k="A-level (90th)" v={adm.indicative_grade_profile.a_level.p90} sub="indicative entry" />
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-end justify-between">
          <h2 className="font-mono text-sm uppercase tracking-widest text-ash">
            Specialization tracks
          </h2>
          <p className="font-mono text-[11px] text-ash">tap a track for courses + careers</p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          {specs.map((s) => {
            const career = careers.specialization_career_map?.map?.[s.slug];
            const courseCount = s.design_electives.length + s.technical_electives.length;
            return (
              <Link
                key={s.slug}
                href={`/specializations/${s.slug}`}
                className="group flex flex-col gap-3 bg-surface p-5 transition-colors hover:bg-surface2"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold leading-tight group-hover:text-ember">
                    {s.name}
                  </h3>
                  <ConfidenceBadge level={s.confidence} />
                </div>
                <p className="font-mono text-[11px] text-ash">
                  {courseCount} electives · MPE: {s.required_mpe.slice(0, 2).join(", ")}
                </p>
                {career && (
                  <p className="mt-auto text-sm text-ash">
                    → {career.roles.slice(0, 2).join(" · ")}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-12 rounded-lg border border-line bg-surface p-6">
        <h2 className="font-mono text-sm uppercase tracking-widest text-ash">
          How recognition works
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-bone">
          To have a specialization printed on your transcript you need{" "}
          <span className="text-ember">{rules.min_au_single_area} AU from one track</span>:
          at least {rules.min_design_electives} design elective and{" "}
          {rules.min_technical_electives} technical electives, all letter-graded.
          Courses you put on FGO do <span className="text-bad">not</span> count.
          You complete {rules.major_pe_required_for_degree} Major Prescribed
          Electives for the degree regardless, and you may hold up to{" "}
          {rules.max_specializations} specializations.
        </p>
      </section>
    </div>
  );
}

function Stat({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div className="bg-surface p-5">
      <p className="font-mono text-[10px] uppercase tracking-wider text-ash">{k}</p>
      <p className="mt-1 text-2xl font-semibold text-bone">{v}</p>
      <p className="font-mono text-[10px] text-ash">{sub}</p>
    </div>
  );
}
