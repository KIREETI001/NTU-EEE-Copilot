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
      <Link href="/" className="font-mono text-xs text-ash hover:text-bone">
        ← all tracks
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{spec.name}</h1>
          <p className="mt-2 font-mono text-xs text-ash">
            Year-3 prerequisite MPE:{" "}
            <span className="text-bone">{spec.required_mpe.join(" · ")}</span>
          </p>
        </div>
        <ConfidenceBadge level={spec.confidence} />
      </header>

      {spec.change_flag && (
        <p className="mt-4 rounded border border-warn/30 bg-warn/5 px-3 py-2 font-mono text-[11px] text-warn">
          ⚠ {spec.change_flag}
        </p>
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <CourseList title="Design electives" courses={spec.design_electives} accent />
        <CourseList title="Technical electives" courses={spec.technical_electives} />
      </div>

      <section className="mt-10 rounded-lg border border-line bg-surface p-5">
        <h2 className="font-mono text-xs uppercase tracking-widest text-ash">
          To claim this specialization
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-bone">
          {rules.min_au_single_area} AU from this track ·{" "}
          ≥{rules.min_design_electives} design + ≥{rules.min_technical_electives} technical ·
          all letter-graded · no FGO. Valid combinations:{" "}
          {rules.valid_combinations.join(" / ")}.
        </p>
      </section>

      {career && (
        <section className="mt-8">
          <h2 className="mb-4 font-mono text-sm uppercase tracking-widest text-ash">
            Where it leads
          </h2>
          <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            <CareerCol title="Sectors" items={career.sectors} />
            <CareerCol title="Roles" items={career.roles} accent />
            <CareerCol title="Employers" items={career.employers} />
          </div>
          <p className="mt-3 font-mono text-[11px] text-ash">
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
      <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-ash">
        {title} <span className="text-ash/60">({courses.length})</span>
      </h2>
      <ul className="space-y-2">
        {courses.map((c) => (
          <li
            key={c.code}
            className="flex items-baseline justify-between gap-3 rounded border border-line bg-surface px-3 py-2"
          >
            <span>
              <span className={`font-mono text-sm ${accent ? "text-ember" : "text-bone"}`}>
                {c.code}
              </span>
              <span className="ml-2 text-sm text-ash">{c.title}</span>
              {c.level === "PG" && (
                <span className="ml-2 font-mono text-[10px] text-warn">PG</span>
              )}
            </span>
            {c.avail && (
              <span className="shrink-0 font-mono text-[10px] text-ash">{c.avail.join("/")}</span>
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
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-ash">{title}</p>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it} className={`text-sm ${accent ? "text-bone" : "text-ash"}`}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
