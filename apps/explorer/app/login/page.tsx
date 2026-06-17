"use client";

// Minimal Supabase email-OTP login for the student surface. Self-contained (no
// callback route): request a 6-digit code, verify it, the session lands in
// cookies that the BFF proxy reads. Swappable for magic-link / OAuth later.
import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import { getSupabaseBrowser } from "@/lib/supabase/client";

const CONFIGURED =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const next = params.get("next") || "/optimizer";

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!CONFIGURED) {
    return (
      <p className="font-mono text-sm text-ash">
        Auth is not configured in this environment. Set{" "}
        <code className="text-ember">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="text-ember">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable login. In
        local dev the optimizer is reachable without auth.
      </p>
    );
  }

  async function sendCode() {
    setErr(null);
    setBusy(true);
    try {
      const { error } = await getSupabaseBrowser().auth.signInWithOtp({ email });
      if (error) throw error;
      setStage("code");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setErr(null);
    setBusy(true);
    try {
      const { error } = await getSupabaseBrowser().auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (error) throw error;
      router.replace(next);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid or expired code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm">
      <h1 className="font-mono text-lg font-semibold">Student sign-in</h1>
      <p className="mt-2 font-mono text-xs text-ash">
        The optimizer simulates irreversible FGO decisions — it is gated. We email a one-time
        code; we never store your password.
      </p>

      {stage === "email" ? (
        <div className="mt-5 flex flex-col gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@e.ntu.edu.sg"
            className="rounded-sm border border-line bg-transparent px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            disabled={busy || !email}
            onClick={sendCode}
            className="rounded-sm border border-ember/60 px-3 py-2 font-mono text-sm text-ember disabled:opacity-40"
          >
            {busy ? "sending…" : "email me a code"}
          </button>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          <input
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            className="rounded-sm border border-line bg-transparent px-3 py-2 font-mono text-sm tracking-widest"
          />
          <button
            type="button"
            disabled={busy || !code}
            onClick={verify}
            className="rounded-sm border border-ember/60 px-3 py-2 font-mono text-sm text-ember disabled:opacity-40"
          >
            {busy ? "verifying…" : "verify & continue"}
          </button>
        </div>
      )}

      {err && <p className="mt-3 font-mono text-xs text-ember">{err}</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="font-mono text-sm text-ash">Loading…</p>}>
      <LoginInner />
    </Suspense>
  );
}
