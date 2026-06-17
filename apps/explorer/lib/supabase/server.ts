// Supabase server client for Route Handlers / Server Components (reads the session
// from cookies via @supabase/ssr). Used by the BFF proxy to verify the session.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { authConfigured } from "./config";

export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          // In a pure route handler the cookie store may be read-only; ignore.
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* read-only context — fine, getUser() doesn't need to write */
          }
        },
      },
    }
  );
}

// The authenticated user, or null. Returns null when auth is not configured
// (local dev) — callers combine this with authRequired() to fail-closed in prod.
export async function getSessionUser() {
  if (!authConfigured()) return null;
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
