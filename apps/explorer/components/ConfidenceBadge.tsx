import type { Confidence } from "@/lib/rulebook";

const MAP: Record<Confidence, { label: string; cls: string; title: string }> = {
  verified: { label: "Verified", cls: "bg-ok/10 text-ok", title: "Checked against a current official NTU source" },
  outdated: { label: "Outdated", cls: "bg-bad/10 text-bad", title: "Known to be out of date; do not rely on it" },
  unverified: { label: "Unverified", cls: "bg-warn/10 text-warn", title: "Not yet confirmed against an official source" },
};

export function ConfidenceBadge({ level }: { level: Confidence }) {
  const m = MAP[level] ?? MAP.unverified;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${m.cls}`}
      title={m.title}
    >
      <svg viewBox="0 0 8 8" className="h-2 w-2" aria-hidden="true"><circle cx="4" cy="4" r="4" fill="currentColor" /></svg>
      {m.label}
    </span>
  );
}
