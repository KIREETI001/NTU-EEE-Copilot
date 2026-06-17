// Edge middleware session refresh + route gate. Keeps the Supabase session cookie
// fresh and blocks un-authed access to the student surface. The route handler
// re-verifies independently (defense in depth) — never trust the matcher alone.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authConfigured, authRequired } from "./config";

function block(request: NextRequest): NextResponse {
  // API calls get a clean 401; page navigations redirect to /login.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  // Not configured (local dev): fail-closed only if auth is required, else pass.
  if (!authConfigured()) {
    return authRequired() ? block(request) : response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (authRequired() && !user) return block(request);
  return response;
}
