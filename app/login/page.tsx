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
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setMsg(error.message);
    else router.replace("/dashboard");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-cx-bg text-cx-text px-6">
      <div className="w-full max-w-md bg-cx-surface border border-cx-border rounded-2xl p-6">
        <h1 className="text-xl font-semibold mb-4">Sign in to Covex</h1>

        <label className="block text-sm text-cx-muted mb-1">Email</label>
        <input
          className="w-full mb-3 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />

        <label className="block text-sm text-cx-muted mb-1">Password</label>
        <input
          className="w-full mb-4 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
        />

        {msg && <div className="text-sm text-rose-400 mb-3">{msg}</div>}

        <button
          onClick={signIn}
          disabled={busy}
          className="btn-pill btn-pill--active w-full justify-center"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
