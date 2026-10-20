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
      {/* Hero: the decision an EEE student actually faces, stated plainly. */}
      <section className="mb-16 grid gap-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-end">
        <div>
          <h1 className="font-serif text-[40px] font-medium leading-[1.05] text-bone sm:text-[56px]">
            Choose your EEE specialization knowing exactly what it takes.
          </h1>
          <p className="mt-6 max-w-[58ch] text-[17px] leading-relaxed text-ash">
            The requirements, electives and career outcomes for all {specs.length} NTU Electrical &amp; Electronic
            Engineering specializations, taken from a rulebook that records where every number came from.
            Written for current undergrads planning their electives and for students deciding whether EEE is for them.
          </p>
        </div>

        <dl className="grid gap-4 rounded-xl border border-line bg-surface p-6 text-[15px] leading-snug">
          <Fact term="Degree">{String(degree.total_au.value)} AU over four years</Fact>
          <Fact term="Specialization">{rules.min_au_single_area} AU from one track, letter-graded</Fact>
          <Fact term="Fresh-grad median pay">
            S${ges2025?.gross_median_sgd?.toLocaleString()} a month (GES 2025)
          </Fact>
          <Fact term="Indicative A-level entry">{adm.indicative_grade_profile.a_level.p90} (90th percentile)</Fact>
        </dl>
      </section>

      <section aria-labelledby="tracks">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-bone pb-3">
          <h2 id="tracks" className="font-serif text-[28px] font-medium">The {specs.length} specializations</h2>
          <p className="text-[14px] text-ash">Open a track for its electives, prerequisites and careers.</p>
        </div>

        <ol>
          {specs.map((s) => {
            const career = careers.specialization_career_map?.map?.[s.slug];
            const courseCount = s.design_electives.length + s.technical_electives.length;
            return (
              <li key={s.slug} className="border-b border-line">
                <Link
                  href={`/specializations/${s.slug}`}
                  className="group grid gap-x-8 gap-y-2 py-6 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-baseline"
                >
                  <span className="font-serif text-[26px] font-medium leading-tight text-bone group-hover:text-ember sm:text-[30px]">
                    {s.name}
                  </span>
                  <span className="text-[15px] leading-relaxed text-ash">
                    {career ? <>Typical roles: {career.roles.slice(0, 2).join(", ")}.<br /></> : null}
                    {courseCount} electives. Prerequisite: {s.required_mpe.slice(0, 2).join(" and ")}.
                  </span>
                  <span className="sm:justify-self-end">
                    <ConfidenceBadge level={s.confidence} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-16 grid gap-6 rounded-xl bg-surface2 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <h2 className="font-serif text-[26px] font-medium leading-tight">How a specialization gets on your transcript</h2>
        <div className="text-[16px] leading-relaxed text-bone">
          <p>
            You need <strong className="font-semibold">{rules.min_au_single_area} AU from one track</strong>: at least{" "}
            {rules.min_design_electives} design elective and {rules.min_technical_electives} technical electives, all
            letter-graded. Courses you take under FGO <strong className="font-semibold text-bad">do not count</strong>.
          </p>
          <p className="mt-3 text-ash">
            Every student completes {rules.major_pe_required_for_degree} Major Prescribed Electives for the degree
            either way, and you can hold up to {rules.max_specializations} specializations.
          </p>
        </div>
      </section>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 border-b border-line pb-4 last:border-0 last:pb-0">
      <dt className="text-ash">{term}</dt>
      <dd className="font-medium text-bone">{children}</dd>
    </div>
  );
}
