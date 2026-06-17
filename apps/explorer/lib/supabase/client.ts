"use client";

// Supabase browser client (@supabase/ssr) — writes the session into cookies that
// the server client + BFF proxy read. Used only by the /login page.
import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
