# Design: Interim access gate for `/optimizer`

**Date:** 2026-06-17
**Status:** Approved (design) — pending implementation plan
**Author:** Claude (with KIREETI001)

---

## Purpose

The `/optimizer` route is the **high-liability** layer of the Co-Pilot: it shows
FGO/CGPA suggestions for an irreversible academic decision. It was just added to
the public header nav, but it is **not gated** — today any visitor lands on it.
The handoff and `CLAUDE.md` both require auth-gating it before any public deploy.

This spec covers an **interim access guard**: block casual visitors now, with
minimal complexity and **no new dependencies**. It is explicitly **not** a
production identity system — no per-student accounts, no stored standing. Those
come later, when the optimizer actually ships to undergrads.

## Goals

- A locked `/optimizer` (and any subroute) that casual visitors cannot reach.
- Unlock via a single shared secret, configured server-side.
- On-brand (SoulVector) unlock page that reinforces the liability messaging.
- **Fail-closed**: if the secret is unconfigured, access is denied.
- No new runtime dependencies; uses Web Crypto + Next.js built-ins.
- The gate logic is a pure, unit-tested module.

## Non-goals (YAGNI)

- Per-user accounts, signup, password reset, roles.
- Persisting any student's transcript/standing.
- Authenticating the **engine** API (`:8000`). It remains open on localhost,
  CORS-limited to the dev origin. Production engine deployment will need its own
  auth — out of scope here, flagged below.
- Rate-limiting / lockout on repeated wrong guesses (acceptable for an interim
  shared-secret guard; note for the future).

---

## Architecture

A Next.js **middleware** intercepts `/optimizer/:path*`. Access requires an
`optimizer_access` cookie whose value equals an HMAC token derived from the
shared secret. If the cookie is missing/invalid (or the secret is unset), the
request is redirected to a styled `/unlock` page. Submitting the correct secret
to a route handler sets the cookie; the user is returned to where they were
headed.

```
visitor → GET /optimizer
              │
        middleware.ts  ── secret unset? ───────────────→ 307 /unlock (fail-closed)
              │                                           (unlock will also fail until configured)
        cookie == expectedToken(secret)? ── no ─────────→ 307 /unlock?next=/optimizer
              │ yes
        render /optimizer (existing page, unchanged)

visitor → /unlock  (styled form)
   submit secret → POST /api/unlock
                       │ constant-time compare vs OPTIMIZER_ACCESS_SECRET
                       ├─ match → Set-Cookie optimizer_access=<token>; { ok:true, next }
                       │           client router.push(next)
                       └─ no    → 401 { ok:false }; inline error
```

The cookie stores `HMAC(secret, label)`, **never the raw secret**. The token is
recomputable in middleware from the env secret, so no server-side session store
is needed.

## Components

### 1. `apps/explorer/lib/optimizer-gate.ts` (pure, testable)

Framework-agnostic. Web Crypto only — **no Next imports** — so it runs unchanged
in Edge middleware, a route handler, and `node --test`.

```ts
const LABEL = "ntu-optimizer-access:v1";

// hex(HMAC-SHA256(key=secret, msg=LABEL))
export async function expectedToken(secret: string): Promise<string>;

// constant-time equality for two strings
export function safeEqual(a: string, b: string): boolean;

// same-origin relative path or fallback to "/optimizer"
export function sanitizeNext(next: string | null | undefined): string;
```

- `expectedToken`: `crypto.subtle.importKey("raw", utf8(secret), {HMAC, SHA-256}, false, ["sign"])` → `sign` over `utf8(LABEL)` → hex.
- `safeEqual`: XOR-accumulate over char codes; fold the length difference into the
  accumulator so unequal lengths still run constant work (no early return).
- `sanitizeNext`: accept only strings starting with a single `/` and not `//` or
  `/\`; else return `/optimizer`. (Open-redirect guard, shared by middleware and route.)

### 2. `apps/explorer/middleware.ts`

```ts
export const config = { matcher: ["/optimizer/:path*"] };
```

Logic (async):
1. `secret = process.env.OPTIMIZER_ACCESS_SECRET`. If falsy → redirect to
   `/unlock?next=<sanitizeNext(path)>` (fail-closed).
2. `cookie = req.cookies.get("optimizer_access")?.value`. If present and
   `safeEqual(cookie, await expectedToken(secret))` → `NextResponse.next()`.
3. Else → 307 redirect to `/unlock?next=<sanitizeNext(path)>`.

### 3. `apps/explorer/app/api/unlock/route.ts`

- `POST`: body `{ secret: string, next?: string }`.
  - Env secret unset → `503 { ok:false, reason:"not_configured" }`.
  - `safeEqual(submitted, envSecret)` false → `401 { ok:false }`.
  - true → response `{ ok:true, next: sanitizeNext(next) }` and
    `res.cookies.set("optimizer_access", await expectedToken(envSecret), {
       httpOnly:true, sameSite:"lax", secure: isProd, path:"/", maxAge: 60*60*12 })`.
- `DELETE`: clear the cookie (the "lock" action). Returns `{ ok:true }`.

`isProd = process.env.NODE_ENV === "production"` — `secure:false` in dev so the
cookie works over `http://localhost`.

### 4. `apps/explorer/app/unlock/page.tsx` (client)

SoulVector-styled: charcoal canvas, ember accent, Plex Mono labels. Contains:
- A short "private · high-liability layer" header and the "verify with the
  Office of Academic Services" reinforcement.
- A password `<input>` + submit.
- `next` read from `useSearchParams()` (default `/optimizer`).
- Submit → `fetch("/api/unlock", {method:"POST", body: JSON})`:
  - `ok` → `router.push(next)`.
  - `401` → inline "incorrect access key" error.
  - `503` → inline "the optimizer access gate isn't configured on this
    deployment" message.

`useSearchParams()` requires a `<Suspense>` boundary in App Router — the page
wraps its form accordingly.

### 5. Config / docs

- `apps/explorer/.env.example` (new): documents `OPTIMIZER_ACCESS_SECRET` and the
  existing `NEXT_PUBLIC_ENGINE_URL` / `NEXT_PUBLIC_REPO`.
- Note in `CLAUDE.md` "Known issues / env" and the README run section: set
  `OPTIMIZER_ACCESS_SECRET` in `apps/explorer/.env.local` for dev.
- The nav link in `layout.tsx` stays **static and always-visible** (reading the
  cookie in the root layout would force every page off SSG). Locked visitors who
  click it simply hit `/unlock`.

---

## Data flow & state

- **No server state.** The cookie is self-verifying (HMAC of the secret). Rotating
  the secret invalidates all existing cookies automatically.
- Cookie lifetime: fixed 12h `maxAge` (no sliding renewal); re-unlock after expiry.
  Acceptable for an interim guard.

## Security

- **Constant-time compares** for both the raw-secret check and the cookie-token
  check (`safeEqual`).
- **No raw secret in the cookie** — only `HMAC(secret, LABEL)`.
- Cookie is `httpOnly` (not JS-readable), `secure` in prod, `sameSite=lax` (so the
  post-unlock same-site navigation carries it).
- **Open-redirect protection** via `sanitizeNext` (shared by middleware + route).
- Secret is **server-only** (`OPTIMIZER_ACCESS_SECRET`, never `NEXT_PUBLIC_*`),
  never logged.
- **Fail-closed**: unset secret → no access.
- Residual risk (accepted, documented): a shared secret is not per-user; the
  engine API is unauthenticated. The gate raises the bar against casual access;
  it is not a substitute for the eventual real auth + engine auth.

## Error handling

| Condition | Behavior |
|---|---|
| Secret unset (middleware) | 307 → `/unlock` (fail-closed) |
| Secret unset (POST /api/unlock) | `503 {reason:"not_configured"}`, unlock page explains |
| Wrong secret | `401`, inline "incorrect access key" |
| Missing/expired cookie | 307 → `/unlock?next=…` |
| Malicious `next` | sanitized to `/optimizer` |

## Testing

The explorer has **no test runner today**. Node is v24 (strips TS types
natively), so the pure module is tested with the **built-in** runner — no new
dependency:

- `apps/explorer/lib/optimizer-gate.test.ts` using `node:test` + `node:assert`:
  - `expectedToken(secret)` is deterministic and a 64-char hex (SHA-256).
  - Different secrets → different tokens.
  - `safeEqual` true for equal strings, false for unequal (incl. different
    lengths).
  - `sanitizeNext` passes `/optimizer`, `/admissions`; rejects `//evil.com`,
    `https://evil.com`, `/\evil`, `""`, `null` → `/optimizer`.
- Add `"test": "node --test lib/**/*.test.ts"` to `apps/explorer/package.json`.
- **End-to-end** (manual or Playwright, both available): locked `/optimizer`
  redirects to `/unlock`; correct key → lands on `/optimizer`; `DELETE`/lock →
  back to locked. Verify the cookie is `httpOnly` and does not contain the raw
  secret.

## Acceptance criteria

1. With `OPTIMIZER_ACCESS_SECRET` set, an un-unlocked GET `/optimizer` returns a
   redirect to `/unlock`.
2. Correct secret via the unlock form lands the user on `/optimizer`; reload stays
   unlocked (cookie persists).
3. Wrong secret shows an inline error and does not set the cookie.
4. With the secret unset, `/optimizer` is denied (fail-closed) and the unlock page
   reports "not configured."
5. `npm --workspace apps/explorer run test` passes (gate unit tests).
6. `npm run explorer:build` stays green.

## Out of scope / follow-ups

- Real per-student auth (Supabase/NextAuth) when the optimizer ships.
- Engine API authentication for any non-local deployment.
- Brute-force protection on `/api/unlock`.
- Hiding the nav link when locked (would require dynamic rendering; deferred).
