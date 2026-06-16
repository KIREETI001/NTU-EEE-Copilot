# Design: Optimizer privacy & access (deferred to deploy-time)

**Date:** 2026-06-17 (revised same day after architecture review)
**Status:** Auth **deferred** — optimizer is local-only today. This doc is the
**deploy-time** design. Do NOT implement until a public deploy is on the table.
**Author:** Claude (with KIREETI001)

---

## Why this was revised

The first draft gated the `/optimizer` **page** with middleware and accepted "the
engine stays open" as a residual risk. That is wrong: the optimizer is a client
component that calls the engine **directly from the browser** via
`NEXT_PUBLIC_ENGINE_URL` ([optimizer/page.tsx:17](../../../apps/explorer/app/optimizer/page.tsx)).
The engine URL is therefore public and the engine has no auth — so a page-route
gate is **bypassable**: anyone can read the URL in devtools and POST to
`/fgo/suggest` directly. A gate must protect the **engine call**, not the page.

## Threat model

- **Asset:** the FGO/CGPA computation (advice on an irreversible action).
- **Exposure (as built):** `/optimizer` (client) → `fetch(NEXT_PUBLIC_ENGINE_URL/…)`
  → unauthenticated engine. The engine is the asset and it is publicly callable
  the moment it is deployed with a browser-reachable URL.
- **Conclusion:** gating the page route does not protect the asset. The engine
  must be **private** (not browser-reachable) and reached only through an
  **authenticated same-origin server route** (BFF proxy).

## Decision

**Local-only for now. Defer auth entirely.** The optimizer runs against
`localhost:8000` in development; nothing is deployed; the engine stores nothing.
The gate is a **deploy-time task** (logged below), not current work.

When a public deploy is on the table, implement the production architecture below.

---

## Production architecture (deploy-time)

**Backend-for-Frontend (proxy) pattern:**

```
browser → /api/optimizer/<path>   (same-origin Next route handler)
              │  server-side: verify signed session cookie (exp checked)
              │  401 if invalid/expired  — UNBYPASSABLE (server-enforced)
              ▼
        ENGINE_URL/<path>   (server-to-server; engine has NO public ingress)
              ▼
        response proxied back to the browser
```

Properties:
- The browser **never** talks to the engine. `NEXT_PUBLIC_ENGINE_URL` is
  **removed**; the engine URL becomes a **server-only** `ENGINE_URL`.
- The engine is deployed **private** (internal network / no public route / or an
  allowlist that only admits the Next server).
- Auth is enforced **server-side in the proxy**, so it cannot be bypassed by
  calling the engine directly (there is nothing to call).

### Components

1. **`apps/explorer/lib/optimizer-gate.ts`** (pure, Web Crypto only, unit-tested)
   ```ts
   // token = base64url(payload) + "." + base64url(HMAC-SHA256(secret, base64url(payload)))
   // payload = { exp: <unix seconds> }   ← EXPIRY IS INSIDE THE SIGNED TOKEN
   export async function signSession(secret: string, ttlSeconds: number): Promise<string>;
   export async function verifySession(secret: string, token: string): Promise<boolean>; // sig + exp>now
   export function safeEqual(a: string, b: string): boolean;        // constant-time
   export function sanitizeNext(next: string | null): string;       // same-origin relative only
   ```
   `verifySession` recomputes the HMAC over the payload (constant-time compare)
   **and** checks `payload.exp > nowSeconds`. A replayed cookie past `exp` is
   rejected regardless of the cookie's `maxAge`.

2. **`apps/explorer/app/api/optimizer/[...path]/route.ts`** — the authenticated
   proxy. For every method: `verifySession(secret, cookie)` → 401 on failure;
   else forward method + JSON body to `${process.env.ENGINE_URL}/<path>`
   (server-to-server) and return the engine's response.

3. **`apps/explorer/middleware.ts`** — `matcher: ["/optimizer/:path*",
   "/api/optimizer/:path*"]`. Server-enforced. Redirects un-authed `/optimizer`
   navigations to `/unlock`; the proxy route **also** self-verifies (defense in
   depth — never trust the matcher alone).

4. **`apps/explorer/app/api/unlock/route.ts`** — `POST` validates the shared
   secret (constant-time), then `Set-Cookie optimizer_access = signSession(secret,
   TTL)` (`httpOnly`, `sameSite=lax`, `secure` in prod, `path=/`). `DELETE` clears.

5. **`apps/explorer/app/unlock/page.tsx`** — SoulVector-styled password form;
   reinforces "private · high-liability · verify with the Office of Academic
   Services." `useSearchParams()` under `<Suspense>`.

6. **Client change in `optimizer/page.tsx`** — `ENGINE` becomes the same-origin
   `"/api/optimizer"`; remove the `NEXT_PUBLIC_ENGINE_URL` default.

### Confirmations requested in review

- **Route gate server-enforced (middleware):** yes — Next middleware runs on the
  edge/server; additionally the proxy route self-verifies. Not client-side.
- **Expiry inside the signed token:** yes (corrected) — `exp` is in the signed
  payload and verified server-side; cookie `maxAge` is only a courtesy hint.

## Security notes

- Constant-time compares (`safeEqual`) for secret and signature checks.
- Signed token carries `exp`; no raw secret in the cookie; `httpOnly`,
  `secure` (prod), `sameSite=lax`.
- `sanitizeNext` blocks open redirects (same-origin relative paths only).
- `OPTIMIZER_ACCESS_SECRET` and `ENGINE_URL` are **server-only** (never
  `NEXT_PUBLIC_*`); never logged.
- Fail-closed: unset secret → no access.
- This shared-secret gate is still **interim** (not per-user). The engine being
  private + proxied is the part that actually protects the asset.

## Testing (deploy-time)

- Unit (`node --test`, no new dep — Node 24): `signSession`/`verifySession`
  round-trip; **expired** token rejected; tampered payload rejected; wrong secret
  rejected; `sanitizeNext` rejects `//evil`, `https://…`, `/\…`.
- E2E (Playwright): direct browser call to the engine URL **fails** (no public
  ingress / not reachable); `/api/optimizer/*` returns 401 without a session;
  unlock → access; expired cookie → 401.

## Deploy-time task checklist (logged — do before any public `/optimizer`)

- [ ] Deploy the engine **private** (no public ingress; reachable only by the
      Next server). Resolves audit §8 + §5.
- [ ] Add the authenticated `/api/optimizer/[...path]` proxy; remove
      `NEXT_PUBLIC_ENGINE_URL`; switch the client to same-origin.
- [ ] Implement `lib/optimizer-gate.ts` (signed-exp token) + `/unlock` + middleware.
- [ ] Tighten engine CORS from `localhost:3000` to the real origin (audit §2/§8).
- [ ] Confirm the engine does **not** log request bodies (grades) — audit §5/PDPA.
- [ ] Decide real per-student auth (Supabase/NextAuth) if accounts are needed.

## Non-goals

- Per-user accounts / stored standing (until a real multi-user need — audit §9).
- Brute-force lockout on `/unlock` (add when public).
