import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import {
  getSpecializations,
  getSpecialization,
  getCareerForSpec,
  getRecognitionRules,
  type Course,
} from "@/lib/rulebook";

export function generateStaticParams() {
  return getSpecializations().map((s) => ({ slug: s.slug }));
}

export default async function SpecPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const spec = getSpecialization(slug);
  if (!spec) notFound();

  const career = getCareerForSpec(slug);
  const rules = getRecognitionRules();

  return (
    <article>
      <Link href="/" className="text-[15px] text-ash underline decoration-line underline-offset-4 hover:text-bone hover:decoration-ash">
        All specializations
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-6">
        <div>
          <h1 className="font-serif text-[40px] font-medium leading-tight sm:text-[48px]">{spec.name}</h1>
          <p className="mt-3 text-[16px] text-ash">
            Year 3 prerequisite (Major Prescribed Elective):{" "}
            <span className="font-medium text-bone">{spec.required_mpe.join(", ")}</span>
          </p>
        </div>
        <ConfidenceBadge level={spec.confidence} />
      </header>

      {spec.change_flag && (
        <p className="mt-6 rounded-lg border-l-4 border-warn bg-warn/10 px-4 py-3 text-[15px] text-bone">
          <strong className="font-semibold text-warn">Recent change. </strong>{spec.change_flag}
        </p>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <CourseList title="Design electives" courses={spec.design_electives} accent />
        <CourseList title="Technical electives" courses={spec.technical_electives} />
      </div>

      <section className="mt-10 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-serif text-[24px] font-medium">To have it recognised</h2>
        <p className="mt-2 text-[16px] leading-relaxed text-bone">
          Take {rules.min_au_single_area} AU from this track, with at least {rules.min_design_electives} design and{" "}
          {rules.min_technical_electives} technical electives, all letter-graded. Courses taken under FGO don&apos;t count.
          Combinations that work: {rules.valid_combinations.join(", or ")}.
        </p>
      </section>

      {career && (
        <section className="mt-8">
          <h2 className="mb-4 font-serif text-[28px] font-medium">Where it leads</h2>
          <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            <CareerCol title="Sectors" items={career.sectors} />
            <CareerCol title="Roles" items={career.roles} accent />
            <CareerCol title="Employers" items={career.employers} />
          </div>
          <p className="mt-3 text-[14px] text-ash">
            Career mapping derived from NTU EEE GES data and specialization scope. Indicative, not a placement guarantee.
          </p>
        </section>
      )}
    </article>
  );
}

function CourseList({
  title,
  courses,
  accent,
}: {
  title: string;
  courses: Course[];
  accent?: boolean;
}) {
  return (
    <div>
      <h2 className="mb-3 flex items-baseline gap-2 font-serif text-[24px] font-medium">
        {title} <span className="font-sans text-[15px] font-normal text-ash">{courses.length}</span>
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {courses.map((c) => (
          <li
            key={c.code}
            className="flex items-baseline justify-between gap-3 px-4 py-3"
          >
            <span>
              <span className={`text-[14px] font-semibold ${accent ? "text-ember" : "text-bone"}`}>
                {c.code}
              </span>
              <span className="ml-3 text-[15px] text-bone">{c.title}</span>
              {c.level === "PG" && (
                <span className="ml-2 rounded bg-warn/10 px-1.5 py-0.5 text-[12.5px] font-medium text-warn" title="Postgraduate-level course">Postgraduate</span>
              )}
            </span>
            {c.avail && (
              <span className="shrink-0 text-[13.5px] text-ash" title="Semesters offered">{c.avail.join(", ")}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CareerCol({ title, items, accent }: { title: string; items: string[]; accent?: boolean }) {
  return (
    <div className="bg-surface p-4">
      <p className="mb-2 text-[14px] font-semibold text-bone">{title}</p>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it} className={`text-[15px] ${accent ? "text-bone" : "text-ash"}`}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
