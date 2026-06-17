import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Gate the high-liability student surface only. Prospective pages stay public.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/optimizer/:path*", "/eligibility/:path*", "/api/optimizer/:path*"],
};
