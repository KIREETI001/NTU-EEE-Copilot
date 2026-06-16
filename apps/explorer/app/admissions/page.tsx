import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { getAdmissions, getDegree } from "@/lib/rulebook";

export default function AdmissionsPage() {
  const adm = getAdmissions();
  const degree = getDegree();
  const igp = adm.indicative_grade_profile;
  const fees = adm.tuition_fees_per_year_sgd;

  return (
    <div>
      <header className="mb-8 flex items-start justify-between gap-3 border-b border-line pb-6">
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-ember">
            For prospective students
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Getting in</h1>
          <p className="mt-2 text-ash">
            Indicative entry, prerequisites, scholarships, and what it costs — AY{igp.academic_year}.
          </p>
        </div>
        <ConfidenceBadge level={igp.confidence} />
      </header>

      <section className="mb-10">
        <h2 className="mb-4 font-mono text-sm uppercase tracking-widest text-ash">
          Indicative grade profile
        </h2>
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          <div className="bg-surface p-5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ash">A-Level (3H2/1H1)</p>
            <p className="mt-1 text-2xl font-semibold">
              {igp.a_level.p10} <span className="text-ash">–</span> {igp.a_level.p90}
            </p>
            <p className="font-mono text-[10px] text-ash">10th – 90th percentile</p>
          </div>
          <div className="bg-surface p-5">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ash">Polytechnic GPA</p>
            <p className="mt-1 text-2xl font-semibold">
              {igp.polytechnic_gpa.p10} <span className="text-ash">–</span> {igp.polytechnic_gpa.p90}
            </p>
            <p className="font-mono text-[10px] text-ash">10th – 90th percentile</p>
          </div>
        </div>
        {igp.change_flag && (
          <p className="mt-3 rounded border border-warn/30 bg-warn/5 px-3 py-2 font-mono text-[11px] text-warn">
            ⚠ {igp.change_flag}
          </p>
        )}
        <p className="mt-3 text-sm text-ash">
          Subject prerequisites:{" "}
          <span className="text-bone">{adm.subject_prerequisites.a_level.join(", ")}</span>.{" "}
          {adm.subject_prerequisites.note}
        </p>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 font-mono text-sm uppercase tracking-widest text-ash">
          Annual tuition (fixed for degree duration)
        </h2>
        <div className="overflow-hidden rounded-lg border border-line">
          {[
            ["Singapore Citizen", fees.singapore_citizen_subsidised],
            ["Singapore PR", fees.singapore_pr_subsidised],
            ["ASEAN (subsidised, incl GST)", fees.asean_intl_subsidised_incl_gst],
            ["Other international (subsidised)", fees.other_intl_subsidised_incl_gst],
            ["Non-subsidised (no grant)", fees.non_subsidised_no_grant],
          ].map(([label, amt], i) => (
            <div
              key={label as string}
              className={`flex items-center justify-between px-4 py-3 ${
                i % 2 ? "bg-surface" : "bg-surface2"
              }`}
            >
              <span className="text-sm text-ash">{label}</span>
              <span className="font-mono text-sm text-bone">
                S${(amt as number).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 font-mono text-[11px] text-ash">{fees.basis}</p>
      </section>

      <section>
        <h2 className="mb-4 font-mono text-sm uppercase tracking-widest text-ash">
          Signature programmes &amp; scholarships
        </h2>
        <div className="space-y-3">
          {adm.signature_programmes.map((p: any) => (
            <div key={p.name} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{p.name}</h3>
                <ConfidenceBadge level={p.confidence} />
              </div>
              {p.note && <p className="mt-1 text-sm text-ash">{p.note}</p>}
              {p.benefits && (
                <p className="mt-2 font-mono text-[11px] text-ash">
                  Living S${p.benefits.living_allowance_per_year_sgd?.toLocaleString()}/yr · travel
                  grant up to S${p.benefits.travel_grant_sgd?.toLocaleString()} · min CGPA {p.min_cgpa}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <p className="mt-8 font-mono text-[11px] text-ash">
        Degree is {degree.total_au.value} AU over {degree.candidature.normal} years (max{" "}
        {degree.candidature.maximum}).
      </p>
    </div>
  );
}
