"use client";

// Role toggle for the header. Persists across sessions via the RoleProvider (localStorage).
import { useRole, type Role } from "@/app/providers/Role";

const OPTIONS: { value: Role; label: string }[] = [
  { value: "prospective", label: "Prospective" },
  { value: "student", label: "Student" },
];

export function RoleSwitch() {
  const { role, setRole, ready } = useRole();
  if (!ready) return <span className="h-8 lg:order-last" aria-hidden="true" />;

  return (
    <span role="group" aria-label="I am a" className="flex shrink-0 items-center gap-0.5 rounded-lg border border-line p-0.5 text-[13.5px] lg:order-last">
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
                ? "whitespace-nowrap rounded-md bg-ember px-2.5 py-1 font-medium text-surface"
                : "whitespace-nowrap rounded-md px-2.5 py-1 text-ash hover:text-bone"
            }
            title={active ? "Your saved role. Click to clear." : opt.value === "student" ? "View as a current student" : "View as a prospective student"}
          >
            {opt.label}
          </button>
        );
      })}
    </span>
  );
}
