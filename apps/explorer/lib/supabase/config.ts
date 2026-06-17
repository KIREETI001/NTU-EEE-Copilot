// Env-only auth config. NO `next/headers` / `next/server` imports here, so this
// module is safe to import from BOTH the edge middleware and node route handlers.

export function authConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Fail-closed in production: the high-liability optimizer must never be reachable
// without a verified session. Dev stays open (direct local flow) unless asked.
//   OPTIMIZER_REQUIRE_AUTH="true"  -> always enforce (test the gate locally)
//   OPTIMIZER_REQUIRE_AUTH="false" -> never enforce (NOT for production)
//   unset                          -> enforce in production only
export function authRequired(): boolean {
  const flag = process.env.OPTIMIZER_REQUIRE_AUTH;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production";
}
