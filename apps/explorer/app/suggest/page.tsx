"use client";

import { useState } from "react";

// The suggestion interface. Corrections to the rulebook are the lifeblood of
// accuracy — students on the ground spot stale rules before any scraper does.
// A submission builds a pre-filled GitHub issue (and a mailto fallback). That
// keeps every correction in the same Git audit trail the rulebook lives in:
// issue -> reviewed -> rulebook PR -> merge = changelog entry.
//
// Set NEXT_PUBLIC_REPO to "owner/name" to enable the GitHub path.
const REPO = process.env.NEXT_PUBLIC_REPO || "";

type Kind = "wrong-data" | "outdated" | "missing" | "other";

const KINDS: { id: Kind; label: string }[] = [
  { id: "wrong-data", label: "A value is wrong" },
  { id: "outdated", label: "A rule changed" },
  { id: "missing", label: "Something's missing" },
  { id: "other", label: "Other" },
];

export default function SuggestPage() {
  const [kind, setKind] = useState<Kind>("wrong-data");
  const [where, setWhere] = useState("");
  const [detail, setDetail] = useState("");
  const [source, setSource] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  const canSubmit = where.trim().length > 1 && detail.trim().length > 4;

  function submit() {
    const title = `[rulebook] ${kind}: ${where.slice(0, 60)}`;
    const body = [
      `**Type:** ${kind}`,
      `**Where (page / specialization / field):** ${where}`,
      "",
      `**What's wrong / should change:**`,
      detail,
      "",
      `**Source / proof (URL, screenshot, official doc):**`,
      source || "_none provided_",
      "",
      "---",
      "_Filed via the Explorer suggestion form. Reviewer: verify against an official NTU source before editing the rulebook YAML._",
    ].join("\n");

    if (REPO) {
      const url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(
        title
      )}&body=${encodeURIComponent(body)}&labels=rulebook,needs-verification`;
      window.open(url, "_blank", "noopener");
      setSubmitted("github");
    } else {
      const url = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
      window.location.href = url;
      setSubmitted("mailto");
    }
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-8 border-b border-line pb-6">
        <p className="mb-2 text-[15px] text-ash">
          Keep the rulebook honest
        </p>
        <h1 className="font-serif text-[40px] font-medium leading-tight sm:text-[48px]">Suggest a fix</h1>
        <p className="mt-2 text-ash">
          Spotted a wrong course code, a changed cap, a missing elective? You see
          rule changes before our monthly audit does. Every suggestion is reviewed
          against an official source before anything changes.
        </p>
      </header>

      <div className="space-y-6">
        <div>
          <label className="mb-2 block font-mono text-[13.5px] text-ash">
            What kind of issue
          </label>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
                  kind === k.id
                    ? "border-ember bg-ember/10 text-ember"
                    : "border-line text-ash hover:border-ash"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <Field
          label="Where is it"
          hint="For example: EE6405 under Data Analysis & ML, or tuition under Admissions"
        >
          <input
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            placeholder="Specialization / page / field"
            className="w-full rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ember"
          />
        </Field>

        <Field label="What should change" hint="Be specific — current value vs. correct value">
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={4}
            placeholder="The code shows EE6405 but the AY2026 catalogue lists it as…"
            className="w-full resize-y rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ember"
          />
        </Field>

        <Field label="Source / proof" hint="Link or document that proves it — speeds up review">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="https://www.ntu.edu.sg/… (optional but powerful)"
            className="w-full rounded border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-ember"
          />
        </Field>

        <div className="flex items-center gap-4 pt-2">
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="rounded bg-ember px-5 py-2.5 font-mono text-sm font-semibold text-canvas transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            Send correction
          </button>
          {!canSubmit && (
            <span className="font-mono text-[13.5px] text-ash">
              Add a location and a description to submit.
            </span>
          )}
        </div>

        {submitted === "github" && (
          <p className="rounded border border-ok/30 bg-ok/5 px-3 py-2 font-mono text-[13.5px] text-ok">
            Opened a pre-filled GitHub issue in a new tab. Submit it there and a maintainer will verify it.
          </p>
        )}
        {submitted === "mailto" && (
          <p className="rounded border border-warn/30 bg-warn/5 px-3 py-2 font-mono text-[13.5px] text-warn">
            No repo configured — opened your email client instead. Set NEXT_PUBLIC_REPO to route suggestions to GitHub.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[13.5px] text-ash">
        {label}
      </label>
      <p className="mb-2 font-mono text-[13.5px] text-ash/70">{hint}</p>
      {children}
    </div>
  );
}
