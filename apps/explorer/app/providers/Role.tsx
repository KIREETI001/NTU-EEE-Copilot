"use client";

// Role persistence. Unlike the student audit (sessionStorage, dies with the tab),
// the user's chosen role persists ACROSS sessions — localStorage — so a returning
// visitor lands in the surface they picked. Role is COSMETIC (which nav/surface);
// the optimizer's real protection is the Supabase gate, never this flag.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "student" | "prospective";
const STORAGE_KEY = "ntu-copilot/role/v1";

type RoleContextValue = {
  role: Role | null;
  setRole: (role: Role | null) => void;
  ready: boolean; // false until localStorage is read (avoids SSR/hydration flash)
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "student" || stored === "prospective") setRoleState(stored);
    } catch {
      /* storage unavailable — role stays null */
    }
    setReady(true);
  }, []);

  const setRole = (next: Role | null) => {
    setRoleState(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  return (
    <RoleContext.Provider value={{ role, setRole, ready }}>{children}</RoleContext.Provider>
  );
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within <RoleProvider>");
  return ctx;
}
