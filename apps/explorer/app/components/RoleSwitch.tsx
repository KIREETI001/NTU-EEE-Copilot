"use client";

// Compact role indicator/toggle for the header. Persists across sessions via the
// RoleProvider (localStorage). Full per-role nav hiding is a WS4 follow-up; this
// is the minimal surface that makes the persisted role visible + switchable.
import { useRole, type Role } from "@/app/providers/Role";

const OPTIONS: { value: Role; label: string }[] = [
  { value: "prospective", label: "prospective" },
  { value: "student", label: "student" },
];

export function RoleSwitch() {
  const { role, setRole, ready } = useRole();
  if (!ready) return <span className="font-mono text-xs text-ash/40">·</span>;

  return (
    <span className="flex items-center gap-1 font-mono text-[11px]">
      {OPTIONS.map((opt) => {
        const active = role === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRole(active ? null : opt.value)}
            aria-pressed={active}
            className={
              active
                ? "rounded-sm border border-ember/60 px-1.5 py-0.5 text-ember"
                : "rounded-sm border border-transparent px-1.5 py-0.5 text-ash hover:text-bone"
            }
            title={active ? "your saved role (click to clear)" : `view as ${opt.label}`}
          >
            {opt.label}
          </button>
        );
      })}
    </span>
  );
}
