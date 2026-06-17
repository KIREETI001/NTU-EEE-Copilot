// =============================================================================
// BFF PROXY  —  the only thing the browser talks to for engine compute.
//
// browser ─fetch("/api/optimizer/cgpa")─▶ this handler (same-origin, public)
//                                            │ verify Supabase session (if required)
//                                            │ allowlist the engine path
//                                            ▼
//                                       ENGINE_URL/cgpa  (server-to-server, PRIVATE)
//                                            ▼
//                                       engine JSON ─passed through byte-for-byte─▶ browser
//
// Design: docs/superpowers/specs/2026-06-18-production-backend-design.md §2.
// The proxy is DUMB TRANSPORT: it adds auth and forwards. It never parses,
// rewrites, caches, or logs academic data — the engine stays the source of truth
// and the FGO irreversibility disclaimer survives intact (byte-for-byte body).
// =============================================================================
import { type NextRequest } from "next/server";

import { resolveEnginePath } from "@/lib/optimizer-proxy";
import { authRequired } from "@/lib/supabase/config";
import { getSessionUser } from "@/lib/supabase/server";

export const runtime = "nodejs"; // must reach a private/loopback engine; not edge
export const dynamic = "force-dynamic"; // never cached/prerendered

const ENGINE_URL = (process.env.ENGINE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const ENGINE_SHARED_SECRET = process.env.ENGINE_SHARED_SECRET; // optional (secret-gated host)
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function handle(
  request: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  // 1. Auth — unbypassable: the route self-verifies, not just the middleware.
  if (authRequired()) {
    const user = await getSessionUser();
    if (!user) return json(401, { error: "unauthorized" });
  }

  // 2. Allowlist the engine path (blocks traversal / SSRF).
  const { path } = await ctx.params;
  const enginePath = resolveEnginePath(path);
  if (!enginePath) return json(404, { error: "not found" });

  // 3. Size guard (a Degree Audit PDF is small).
  const declaredLen = Number(request.headers.get("content-length") || 0);
  if (declaredLen > MAX_BODY_BYTES) return json(413, { error: "payload too large" });

  // 4. Forward server-to-server. Only Content-Type is passed; strip cookies/auth
  //    (the engine is trustless). Body streamed through unparsed so the multipart
  //    PDF boundary and JSON bytes are never mutated.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {};
    const ct = request.headers.get("content-type");
    if (ct) headers["content-type"] = ct;
    if (ENGINE_SHARED_SECRET) headers["x-internal-secret"] = ENGINE_SHARED_SECRET;

    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      signal: controller.signal,
      cache: "no-store",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      init.duplex = "half"; // required when streaming a request body in Node fetch
    }

    const engineRes = await fetch(`${ENGINE_URL}${enginePath}`, init);

    // 5. Byte-for-byte pass-through: mirror status, stream body, copy Content-Type.
    const outHeaders = new Headers();
    const resCt = engineRes.headers.get("content-type");
    if (resCt) outHeaders.set("content-type", resCt);
    outHeaders.set("cache-control", "no-store");
    return new Response(engineRes.body, { status: engineRes.status, headers: outHeaders });
  } catch {
    // Generic — never leak the engine origin, stack, or request body (§2.5).
    return json(502, { error: "engine unavailable" });
  } finally {
    clearTimeout(timer);
  }
}

export const POST = handle;
export const GET = handle;
