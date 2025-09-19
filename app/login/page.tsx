"use client";

import { useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setMsg(error.message);
    else router.replace("/dashboard");
  }

  async function signUp() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signUp({ email, password: pw });
    setBusy(false);
    if (error) setMsg(error.message);
    else setMsg("Check your email to confirm your account, then sign in.");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-cx-bg text-cx-text px-6">
      <div className="w-full max-w-md bg-cx-surface border border-cx-border rounded-2xl p-6">
        <h1 className="text-xl font-semibold mb-4">Sign in to Covex</h1>

        <label className="block text-sm text-cx-muted mb-1">Email</label>
        <input
          className="w-full mb-3 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        />

        <label className="block text-sm text-cx-muted mb-1">Password</label>
        <input
          className="w-full mb-4 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
          type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        />

        {msg && <div className="text-sm text-red-400 mb-3">{msg}</div>}

        <div className="flex gap-2">
          <button onClick={signIn} disabled={busy} className="btn-pill btn-pill--active">Sign in</button>
          <button onClick={signUp} disabled={busy} className="btn-pill">Create account</button>
        </div>

        <p className="text-xs text-cx-muted mt-4">
          Make sure <code className="text-white">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-white">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are set.
        </p>
      </div>
    </div>
  );
}
