import type { Confidence } from "@/lib/rulebook";

const MAP: Record<Confidence, { label: string; cls: string }> = {
  verified: { label: "verified", cls: "border-ok/40 text-ok" },
  outdated: { label: "outdated", cls: "border-bad/40 text-bad" },
  unverified: { label: "unverified", cls: "border-warn/40 text-warn" },
};

export function ConfidenceBadge({ level }: { level: Confidence }) {
  const m = MAP[level] ?? MAP.unverified;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${m.cls}`}
      title={`Data confidence: ${m.label}`}
    >
      <span className="pulse-dot">●</span>
      {m.label}
    </span>
  );
}
