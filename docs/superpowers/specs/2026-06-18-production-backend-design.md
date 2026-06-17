# Design: Production backend architecture — private engine + BFF proxy

**Date:** 2026-06-18
**Status:** DESIGN ONLY. Nothing here is implemented or wired in this branch. The
optimizer remains **local-only** today (browser → engine direct via
`NEXT_PUBLIC_ENGINE_URL`). This doc is the **deploy-time** blueprint and the
direct successor to `2026-06-17-optimizer-access-gate-design.md`.
**Author:** Claude (with KIREETI001)
**Workstream:** WS5 — "make the backend better" (resolved to: production backend architecture)

> This is the concrete answer to roadmap WS5
> (`2026-06-17-ux-program-roadmap.md` §119–126), which says WS5 "most likely…
> resolves to the production backend architecture: private engine + authenticated
> same-origin proxy + signed-exp sessions." It builds **on top of** the access-gate
> spec — that doc decided *that* we need a private engine + proxy + signed-exp
> token; this doc specifies *how to host, wire, and ship it*, with the request
> contract, CORS posture, logging guarantees, CI pipeline, and the user-decision log.

---

## 0. Non-negotiables carried into every decision below

1. **No academic fact without the rulebook.** The proxy is a dumb transport. It
   adds auth and nothing else — it never computes, rewrites, caches, or summarizes
   a CGPA/FGO/specialization number. The engine (which reads `rulebook/`) stays the
   single source of truth. The proxy MUST NOT inject defaults or "helpful" fields.
2. **FGO is irreversible.** The `/fgo/suggest` and `/fgo/simulate` responses carry
   the engine-authored disclaimer (`main.py:129–134`). The proxy passes the engine
   body through **byte-for-byte**; it must never strip, truncate, or reformat that
   disclaimer. (See §2.4 — pass-through contract.)
3. **Don't break what's green.** No change here touches engine math or its tests,
   and the explorer build must stay green. The client change in §2.5 is the only
   production-code edit this design eventually requires, and it is a *narrowing*
   (absolute URL → relative path).
4. **PDPA: grades never leave the request path.** No request body, course code,
   grade, or audit content is logged at any tier (§5).

---

## 1. Private engine — no public ingress

### 1.1 The problem being fixed

Today (`apps/explorer/app/optimizer/page.tsx:19`):

```ts
const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8000";
```

`NEXT_PUBLIC_*` is **inlined into the client bundle at build time**. The moment the
optimizer ships with a real engine URL, that origin is in the page source and the
engine — which has **no auth** (`main.py` has zero auth dependency) — is directly
POST-able by anyone. The access-gate spec already reached this conclusion; the fix
is structural: **the engine must not be reachable from the public internet at all.**

### 1.2 What "private" must mean (the property, not the product)

The engine MUST be reachable **only** by the Next.js server process, and by nothing
else — not the browser, not the open internet. Any hosting option that delivers
this property is acceptable; the option is a *deployment* decision (logged in §7),
not an architectural one. The property:

> There exists no network path from a browser (or an arbitrary internet host) to
> `ENGINE_URL`. The only client of the engine is the Next server's
> `/api/optimizer/*` route handler, server-to-server.

### 1.3 Hosting options + tradeoffs

| Option | How the engine stays private | Pros | Cons | Fits us? |
|---|---|---|---|---|
| **A. Same host, loopback port** — explorer (Node) and engine (uvicorn) on one VM/container; engine binds `127.0.0.1:8000`; `ENGINE_URL=http://127.0.0.1:8000` | Engine never binds a public interface; OS-level isolation | Simplest; zero network hops; no extra infra; CORS becomes a non-issue (§4) | One box = explorer can't be a pure static/edge host; you operate a server; scaling is vertical | **Recommended** for v1 — see §1.4 |
| **B. Two containers, private network** — engine container with **no published port**, on a Docker/Compose or platform private network; explorer container reaches it by service DNS (`http://engine:8000`) | Engine has no ingress route; only same-network peers reach it | Clean separation; horizontal scale per service; portable (Compose → Fly/Render/Railway/ECS) | More moving parts; need a platform that supports private service-to-service networking | Strong second; pick if you outgrow A |
| **C. Engine as serverless function** (engine packaged as a function behind the same platform, invoked server-to-server only) | No public route; invoked by the Next server via an internal binding/secret | Scales to zero; pay-per-call | **pdfplumber + cold starts** are heavy for `/parse-audit`; FastAPI→function adapters add friction; harder to keep "private" guarantee crisp | Not for v1 — parser weight + cold starts |
| **D. Engine public but network-allowlisted** (public URL, firewall/allowlist only the Next egress IP) | Allowlist, not true isolation | Works on hosts without private networking | Allowlists drift; a public URL with no auth is one misconfig from open; the access-gate spec explicitly distrusts this | **Reject** unless A/B are impossible |

### 1.4 Recommendation — **FLAG FOR USER CONFIRMATION**

**Recommend Option A (same host, loopback port) for the first private deploy**,
with Option B as the documented scale-out path. Rationale: one undergrad-scale
user, a heavy `pdfplumber` dependency that dislikes serverless cold starts, and the
strongest *simplest* privacy guarantee (the engine literally binds loopback). It
also makes CORS a non-problem (§4).

> **This is a deployment decision that requires the user.** A vs B changes the
> host shape and whether the explorer can be edge-hosted. Do not pick the host
> without confirming with the user (logged in §7, row "Engine host topology").
> Until confirmed, the optimizer stays local-only.

The trade Option A forces: the explorer can no longer be a *pure* static/edge
deploy, because `/api/optimizer/*` is a server route that must run next to the
engine. Static explorer + private engine elsewhere ⇒ Option B. This is the §8
deployment tension from `audit-2026-06-17.md`, now made explicit.

---

## 2. Next BFF (Backend-for-Frontend) proxy

A single catch-all route handler that authenticates, then forwards to the private
engine server-to-server. This is the **only** thing the browser talks to.

```
browser ──fetch("/api/optimizer/cgpa")──▶ Next route handler  (same-origin, public)
                                              │ verify signed session cookie (exp)
                                              │ 401 if missing / invalid / expired
                                              ▼
                                          ENGINE_URL/cgpa     (server-to-server, PRIVATE)
                                              ▼
                                          engine JSON ──passed through byte-for-byte──▶ browser
```

### 2.1 File

`apps/explorer/app/api/optimizer/[...path]/route.ts` — a catch-all Route Handler
(Node.js runtime, **not** edge — it must reach a private/loopback engine and read a
server-only secret; the edge runtime cannot reach loopback).

```ts
export const runtime = "nodejs";        // must reach private engine; not edge
export const dynamic = "force-dynamic"; // never cached/prerendered
```

### 2.2 Request contract

| Aspect | Decision |
|---|---|
| **Methods** | `POST` (all engine compute endpoints) and `GET` (`/health` only, optional). Export `POST` and `GET` handlers; both share one `handle()` that verifies then forwards. |
| **Path mapping** | `params.path: string[]` → `"/" + path.join("/")`. `fetch("/api/optimizer/fgo/suggest")` ⇒ engine `POST ${ENGINE_URL}/fgo/suggest`. Validate each segment against `^[a-z0-9-]+$` and reject `.`/`..` to prevent path traversal onto unintended engine routes. |
| **Allowlist** | Forward ONLY to the known engine endpoints (`cgpa`, `fgo/quota`, `fgo/simulate`, `fgo/suggest`, `specialization/check`, `honours`, `parse-audit`, `health`). A constant `Set` of allowed paths; 404 anything else. Defense in depth: the engine has no other routes, but the allowlist stops the proxy from being a generic SSRF gadget. |
| **Body — JSON endpoints** | Read the raw body and forward unparsed with `Content-Type: application/json`. **Do not** `JSON.parse` then re-stringify (that would let the proxy mutate academic input and risks reordering). Stream/forward bytes. |
| **Body — `/parse-audit` (multipart)** | Forward the incoming `Request` body and its `Content-Type` (the multipart boundary) unchanged. Do **not** buffer-and-reconstruct the `FormData` (re-encoding risks corrupting the PDF and re-derives a boundary). Pass `request.body` through with `duplex: "half"`. The PDF stays in-flight; never written to disk by the proxy. |
| **Headers forwarded to engine** | `Content-Type` only. Strip `Cookie`, `Authorization`, and all client headers — the engine is trustless and needs none. Add nothing the engine doesn't read. |
| **Size guard** | Reject bodies over a small cap (e.g. 6 MB) before forwarding — a Degree Audit PDF is small; this bounds abuse. |

### 2.3 Auth enforcement (ties to §3)

Before forwarding, every request calls `verifySession(secret, cookie)` (the
signed-exp verifier from the access-gate spec, §3 here). On failure:

```
401  { "error": "unauthorized" }      // no session, bad signature, or exp <= now
```

This is **unbypassable**: the only route to the engine is through this handler, and
the handler self-verifies (it does not trust middleware alone — defense in depth,
matching the access-gate spec's confirmation §98–104).

### 2.4 Response contract — **byte-for-byte pass-through**

| Aspect | Decision |
|---|---|
| **Status** | Mirror the engine's status code exactly (200, 404, **422** domain errors, etc.). Never coerce a 422 into a 200. |
| **Body** | Stream the engine's response body through unchanged. The FGO disclaimer (`main.py:129`) and irreversibility warnings MUST survive intact — the proxy never reads, trims, or re-serializes the JSON. |
| **Content-Type** | Copy the engine's `Content-Type` (always `application/json` today). |
| **Streaming vs JSON** | **JSON pass-through, no buffering of meaning.** All current engine responses are small JSON objects computed synchronously (no SSE, no chunked streaming in `main.py`). So there is nothing to *stream* semantically. Still, forward the body as a stream (`new Response(engineRes.body, …)`) rather than `await engineRes.json()` then re-`JSON.stringify` — that avoids the proxy ever parsing (and thus being able to mutate or accidentally log) academic data. If a future endpoint streams, this already supports it. |
| **Caching** | `Cache-Control: no-store` on every proxied response. CGPA/FGO output is per-student and must never be cached at the edge/CDN. |

### 2.5 Error mapping

| Failure | Proxy response |
|---|---|
| No / invalid / expired session | `401 {"error":"unauthorized"}` |
| Path not in allowlist | `404 {"error":"not found"}` |
| Body too large | `413 {"error":"payload too large"}` |
| Engine returns 4xx/5xx | **Mirror the engine status + body** (so 422 domain errors reach the UI as the engine wrote them) |
| Engine unreachable / fetch throws / timeout | `502 {"error":"engine unavailable"}` — a **generic** message. Do **not** include the engine origin, stack trace, or the request body in the error (that would leak the private origin and/or grades). Log nothing sensitive (§5). |

A `fetch` timeout (AbortController, e.g. 15s) prevents a hung engine from pinning a
Node request. On timeout ⇒ 502 generic.

### 2.6 Client change (the only production-code edit this design needs)

In `apps/explorer/app/optimizer/page.tsx`:

```ts
// BEFORE (leaks engine origin to the browser bundle):
const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:8000";

// AFTER (same-origin; nothing about the engine reaches the client):
const ENGINE = "/api/optimizer";
```

Everything else in `page.tsx` is unchanged: `call()` already does
`fetch(`${ENGINE}${path}`, …)` (line 83) and `onUpload` already does
`fetch(`${ENGINE}/parse-audit`, …)` (line 127). Both become relative, same-origin
requests that carry the session cookie automatically. `NEXT_PUBLIC_ENGINE_URL` is
**deleted** from all envs; the server-only `ENGINE_URL` replaces it (read only
inside the route handler, never `NEXT_PUBLIC_*`).

Local dev parity: in dev, run the engine on `127.0.0.1:8000`, set `ENGINE_URL` in
`apps/explorer/.env.local` (server-only), and the same proxy path works — so dev and
prod exercise the identical code path. (Optionally, keep today's direct-call mode
behind a dev-only flag until the proxy lands; the access-gate spec marks the proxy
as deploy-time, so direct-call dev stays valid until then.)

---

## 3. Sessions — signed, short-expiry (signed-exp)

This adopts the access-gate spec's token wholesale (`optimizer-gate.ts`, §60–73 of
that doc). Recap + the production specifics the proxy needs.

### 3.1 Token shape

```
token   = base64url(payload) + "." + base64url(HMAC_SHA256(secret, base64url(payload)))
payload = { "exp": <unix seconds> }       ← EXPIRY IS INSIDE THE SIGNED PAYLOAD
```

- Stored in cookie `optimizer_access`: `httpOnly`, `sameSite=lax`, `secure` (prod),
  `path=/`, `maxAge ≈ TTL`.
- `verifySession` recomputes the HMAC (constant-time `safeEqual`) **and** checks
  `payload.exp > nowSeconds`. A replayed cookie past `exp` is rejected regardless of
  the browser-side `maxAge` — the cookie `maxAge` is only a courtesy hint.
- Implemented with **Web Crypto** (`crypto.subtle`), no new dependency, unit-tested
  per the access-gate spec's test list (§118–124).

### 3.2 Where the secret lives

| Aspect | Decision |
|---|---|
| **Name** | `OPTIMIZER_ACCESS_SECRET` — server-only env var. **Never** `NEXT_PUBLIC_*`. Never committed; never logged. |
| **Storage** | The host's secret store (platform env-var/secret manager). Injected at runtime into the Next server process only. |
| **Fail-closed** | If unset → `verifySession` returns false for everything → no optimizer access. (Access-gate spec §113.) |
| **Rotation** | Rotating the secret invalidates all live sessions (acceptable — TTL is short). For zero-downtime rotation later, accept a small `OPTIMIZER_ACCESS_SECRET_PREVIOUS` during the overlap window. Not needed for v1. |

### 3.3 Refresh / expiry

- **TTL:** short — recommend **30–60 min** (decision logged §7). High-liability
  surface; a stale tab should re-auth.
- **Expiry:** enforced server-side via `payload.exp` on every proxied call (§3.1).
- **Refresh (v1):** none — when the token expires, the proxy 401s, the UI redirects
  to `/unlock`, the user re-enters the secret. Simple and safe.
- **Sliding refresh (optional, later):** on a *successful* verify within the last N
  minutes of life, the route may re-issue a fresh cookie (`Set-Cookie` with a new
  `exp`). Adds UX smoothness; defer until there's a real session-length complaint.

### 3.4 How the proxy enforces them

The `/api/optimizer/[...path]` handler calls `verifySession` **first thing**, before
reading the body or touching the engine. No valid session ⇒ 401, engine never
contacted. Plus `middleware.ts` (`matcher: ["/optimizer/:path*",
"/api/optimizer/:path*"]`) redirects un-authed `/optimizer` *navigations* to
`/unlock` — but the route handler's own check is the real gate (never trust the
matcher alone). This is exactly the access-gate spec's components 2–4.

### 3.5 Tie to the auth-provider decision

The access-gate spec is explicit (§114–115): the shared-secret unlock is **interim**
(one secret, not per-student). The *real* protection is "engine private + proxied,"
which this doc delivers. The token/cookie/proxy machinery here is **provider-agnostic
by design**: swapping the shared-secret `/unlock` for a real per-user provider
(Supabase Auth / NextAuth, the access-gate spec's deferred decision §135) changes
**only** how the cookie is minted and what `verifySession` trusts (a real session/JWT
vs the HMAC token). The proxy's enforcement seam — "verify a server-trusted session,
then forward" — is unchanged. **Auth provider is a user decision (logged §7).**

---

## 4. CORS tightening

### 4.1 Today

`main.py:41–46`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],   # explorer dev server
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Correct for local dev (browser on `:3000` calling engine on `:8000`). Wrong for prod.

### 4.2 Prod posture — **no browser CORS at all**

Once the engine is private (§1), **no browser ever calls it**, so it needs **no CORS
headers whatsoever**. CORS only governs browser cross-origin requests; server-to-server
calls from the Next proxy are not subject to CORS and ignore it. Therefore:

| Deploy shape | Prod CORS on the engine |
|---|---|
| **Option A (loopback)** | **Remove the CORS middleware entirely** (or set `allow_origins=[]`). The only caller is the Next server over loopback — not a browser, not cross-origin. Zero CORS surface. |
| **Option B (private network)** | Same — **no CORS**. The proxy reaches `http://engine:8000` server-to-server. |

**Decision: gate CORS by environment.** Drive `allow_origins` from an env var
(default empty/closed in prod):

```python
import os
_origins = [o for o in os.getenv("ENGINE_CORS_ORIGINS", "").split(",") if o]
if _origins:                       # dev only; empty in prod ⇒ no CORS middleware
    app.add_middleware(CORSMiddleware, allow_origins=_origins, ...)
```

- **Dev:** `ENGINE_CORS_ORIGINS=http://localhost:3000` (preserves today's behavior).
- **Prod:** unset ⇒ **no CORS middleware mounted** ⇒ the engine answers no browser
  preflight ⇒ even if the private boundary were somehow bypassed, a browser still
  can't read cross-origin responses. Belt and suspenders behind the private network.

This is a small, env-gated change to `main.py` and does not alter any engine
math or any test (`test_api.py` uses `TestClient`, which does not exercise CORS).
**Implement at deploy time**, not now.

### 4.3 Methods/headers

Drop the `allow_methods=["*"] / allow_headers=["*"]` wildcards when CORS is used in
dev; scope to `POST, GET` + `Content-Type`. Moot in prod (no CORS).

---

## 5. No sensitive logging — audit + guarantee

**The rule:** no request body, grade, course code, CGPA/FGO value, PDF byte, or
audit content is written to any log at any tier — engine, proxy, or host. This is a
PDPA guarantee and the access-gate spec's deploy checklist item (§134).

### 5.1 Audit of the current engine + parser (what I checked, what I found)

I grepped the entire engine source (`services/engine/app`, excluding `.venv` and
tests) for `import logging | getLogger | logging.* | print( | loguru | sys.stdout |
sys.stderr | access_log`.

| Component | Finding |
|---|---|
| `app/main.py` (FastAPI surface) | **No logging of any kind.** No `logging` import, no `print`. The `ValueError` handler (`main.py:49–53`) returns `str(exc)` in the **response body** (a 422 to the caller) — that is a response to the proxy, **not** a server log, and it contains at most a single offending token (e.g. an unknown grade `"Z"`), never the full transcript. Acceptable; see §5.3. |
| `app/parser/audit.py` | **No logging/printing.** PDF parsed in memory; warnings are returned **in the response model** (`AuditParseResult.warnings`), not logged. The `/parse-audit` docstring (`main.py:164–168`) states the PDF "is never stored or logged." Confirmed in code. |
| `app/engine/*.py`, `models.py`, `rulebook.py` | **No logging.** Pure functions / YAML I/O only. |
| `app/parser/__main__.py` (**CLI only**) | **`print()`s the full parse result** (codes, grades) to **stdout/stderr** — `print(json.dumps(result.model_dump()…))` (line 23) and the cross-check verdict (lines 32–39). This is the **local developer CLI** (`python -m app.parser <pdf>`), run by hand on the dev's own machine. It is **not** on the server request path and never executes in the FastAPI process. **Not a leak**, but see §5.3 mitigation so it can never become one. |

**Bottom line:** the live request path (FastAPI + parser) logs **nothing
sensitive** today. This matches `audit-2026-06-17.md` §5 ("engine logs no request
bodies; uvicorn access log only") and §7 ("structured logs WITHOUT raw grades").

### 5.2 The one real risk to manage in prod: the uvicorn/ASGI access log

uvicorn's default access log records **method + path + status**, e.g.
`POST /fgo/suggest 200`. Paths in this design carry **no** query-string PII (all
data is in the POST body), so the access log is safe — **provided** no future
endpoint puts grades/codes in the URL or query string. **Rule: keep all academic
data in request bodies, never in the path or query.** (`/parse-audit` takes
`university/programme/cohort` as query params today — those are non-sensitive cohort
identifiers, fine to appear in a log.)

### 5.3 Guarantees to encode at deploy time

1. **Engine:** keep `main.py` free of `logging`/`print`. If structured logging is
   ever added (audit §7 anticipates it when public), log **only** `{method, path,
   status, duration_ms}` — an explicit allowlist of non-sensitive fields. **Never**
   `repr(request)`, never the body, never `exc` for body-bearing endpoints. Add a CI
   grep (`grep -rnE "print\(|logging\." services/engine/app/main.py
   services/engine/app/parser/audit.py` ⇒ fail) to keep the request path clean.
2. **Engine ValueError handler:** acceptable as-is (returns one token to the proxy).
   If hardened later, return a generic 422 message and put the offending value
   nowhere in any server log.
3. **Parser CLI:** leave it (it's a local tool), but **never** import
   `app.parser.__main__` into the server, and never route its `print` into a logger.
   A comment + the CI grep above enforce this.
4. **Proxy (`route.ts`):** **log nothing about the body.** No `console.log(body)`,
   no logging the engine origin on error (§2.5 returns a generic 502). If request
   logging is wanted, log only `{method, path, status}` (path is the allowlisted
   engine route name — no PII). `Cache-Control: no-store` (§2.4) keeps responses out
   of any CDN/edge cache.
5. **Host:** disable any platform request-body capture / APM payload logging for the
   engine and the `/api/optimizer/*` route. Confirm the platform's access logs don't
   record POST bodies (most don't by default).

---

## 6. CI deploy pipeline

Extends the existing `.github/workflows/ci.yml` (two jobs today: **engine pytest**;
**rulebook + explorer build/validate**). Keep those as the gate; add build + deploy
**downstream of green**, and add the new test/lint surfaces this design introduces.

### 6.1 Gate (must stay green — already exists, extend slightly)

- **`engine` job** (unchanged): `pip install -r requirements.txt` → `pytest -q`.
- **`rulebook-explorer` job** (unchanged): rulebook validate → rebuild → `git
  diff --exit-code` staleness → one-rule grep → `explorer:build` → `npm audit`.
- **Add:** a **proxy/gate unit-test step** — once `lib/optimizer-gate.ts` and the
  route handler land, run `node --test` for the signed-exp round-trip / expired /
  tampered / wrong-secret / `sanitizeNext` cases (access-gate spec §118–124). No new
  dependency (Node ≥ 22 test runner; CI already uses Node 22).
- **Add:** the **no-sensitive-logging grep** from §5.3.1 as a CI step (fails if
  `print(`/`logging.` appears in the request-path files).

### 6.2 Build

- **Explorer:** `npm run explorer:build` (already in the gate). Produces the Next
  server bundle (now including the `/api/optimizer` route + middleware). Because the
  proxy is a **server** route, the explorer build target is a Node server, not a
  pure static export (see §1.4 trade).
- **Engine:** build the deployable artifact for the chosen host (Option A/B) — e.g.
  a container image (`uvicorn app.main:app`), or the venv + source bundle. Pin
  Python to **3.12** (matches the CI `engine` job).

### 6.3 Deploy (downstream of green; manual-approval gated)

Add a **`deploy` job** that runs **only on the default branch after both gate jobs
pass**, behind a GitHub **Environment** with required reviewers (so a human approves
each production deploy — appropriate for a high-liability surface):

```yaml
deploy:
  name: Deploy (private engine + explorer)
  needs: [engine, rulebook-explorer]
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest
  environment: production          # required-reviewer gate; holds the secrets
  steps:
    - deploy ENGINE  (private: no public ingress — §1; inject OPTIMIZER_ACCESS_SECRET, ENGINE_URL, ENGINE_CORS_ORIGINS="")
    - deploy EXPLORER (Next server; ENGINE_URL points at the private engine; NO NEXT_PUBLIC_ENGINE_URL)
    - post-deploy smoke: assert the public engine URL is UNREACHABLE; assert /api/optimizer/* returns 401 without a session
```

- **Order:** deploy/verify the **engine privately first**, then the explorer (so the
  proxy never points at a missing engine). For Option A (same host) they ship
  together; the smoke test still asserts the engine has no public route.
- **Secrets** live in the GitHub Environment (or the host's secret store), injected
  at deploy — never in the repo, never echoed in logs.
- **Smoke test is the safety net:** it must **fail the deploy** if the engine is
  publicly reachable or if `/api/optimizer/*` answers without a session. This catches
  the exact misconfig the whole design exists to prevent.
- **Deploy targets are user decisions** (§7) — this job is written against
  placeholders until the host/platform is chosen.

---

## 7. Decision log — items REQUIRING THE USER

Nothing below is implemented in this branch. Each needs a user call before any
public deploy.

| # | Decision | Options | Recommendation | Why it needs the user |
|---|---|---|---|---|
| 1 | **Engine host topology** | A) Same host, loopback port · B) Two containers, private network · C) Serverless function · D) Public + IP allowlist | **A for v1** (simplest true-private; parser dislikes serverless); B as scale-out | Sets cost, ops burden, and whether the explorer can be edge-hosted; D is a security-posture call (we advise against) |
| 2 | **Deploy target / platform** | Single VM (A) · Fly/Render/Railway/ECS (A or B) · Vercel for explorer + private engine elsewhere (B) | A single VM or a platform with **private service networking** (so the engine truly has no ingress) | Money, vendor lock-in, region/PDPA data-residency; the platform must support a *private* engine |
| 3 | **Public domain + TLS** | Apex vs subdomain for the explorer; managed cert (platform) vs custom | A subdomain (e.g. `app.<domain>`) with platform-managed TLS | The domain is the user's to own/point; cookies' `secure`/`sameSite` assume HTTPS |
| 4 | **Auth provider** (replaces the interim shared secret) | i) Keep shared-secret `/unlock` (interim) · ii) Supabase Auth · iii) NextAuth/Auth.js · iv) NTU SSO if ever available | **Start (i) interim** (already designed, low effort); plan **(ii) or (iii)** before multi-user / saved standing | Real accounts touch PDPA, data retention, and a vendor choice; the access-gate spec deferred this on purpose |
| 5 | **Session secret management** | Platform env var/secret manager · GitHub Environment secret · external KMS/Vault | Platform secret store, injected at runtime as `OPTIMIZER_ACCESS_SECRET` (server-only) | Who can read prod secrets and how they rotate is the user's operational policy |
| 6 | **Session TTL + refresh** | 30 min / 60 min / longer; hard-expiry vs sliding refresh | **30–60 min, hard expiry** for v1 (high-liability); add sliding refresh only if friction is reported | UX-vs-safety trade the product owner should set |
| 7 | **Deploy approval gate** | Auto-deploy on green · manual-approval Environment | **Manual-approval** GitHub Environment (human in the loop for an irreversible-advice surface) | Whether a human must approve each prod deploy is a risk-appetite call |

---

## 8. What changes, where (deploy-time implementation map — NOT done here)

| File | Change | Status |
|---|---|---|
| `apps/explorer/app/api/optimizer/[...path]/route.ts` | **New** — the BFF proxy (§2): verify session → allowlist path → forward to `ENGINE_URL` server-to-server → pass response through byte-for-byte | deploy-time |
| `apps/explorer/lib/optimizer-gate.ts` | **New** — `signSession`/`verifySession`/`safeEqual`/`sanitizeNext` (access-gate spec §60) | deploy-time |
| `apps/explorer/app/api/unlock/route.ts` + `app/unlock/page.tsx` + `middleware.ts` | **New** — interim shared-secret unlock + route gate (access-gate spec §77–93) | deploy-time |
| `apps/explorer/app/optimizer/page.tsx:19` | **Edit** — `ENGINE = "/api/optimizer"`; drop `NEXT_PUBLIC_ENGINE_URL` (§2.6) | deploy-time |
| `services/engine/app/main.py:41–46` | **Edit** — env-gated CORS; empty/closed in prod (§4.2) | deploy-time |
| `.github/workflows/ci.yml` | **Edit** — add gate-time proxy unit tests + no-logging grep; add manual-approval `deploy` job + smoke test (§6) | deploy-time |
| envs | `ENGINE_URL`, `OPTIMIZER_ACCESS_SECRET`, `ENGINE_CORS_ORIGINS` (server-only); **delete** `NEXT_PUBLIC_ENGINE_URL` everywhere | deploy-time |

## 9. Non-goals (this doc)

- Per-user accounts / stored standing / a database (access-gate spec §139; audit §9).
- Brute-force lockout on `/unlock`, prod security headers, rate limiting — add when
  public (access-gate spec §141; audit §5).
- Any change to engine **math** or the rulebook. The proxy is pure transport.
- Implementing or wiring any of the above in this branch — **design only**.
