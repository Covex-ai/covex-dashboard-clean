"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const sb = useMemo(() => createBrowserSupabaseClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError(error.message); return; }
    if (data?.user) router.replace("/appointments");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-xl font-semibold">Sign in</h1>

      <div className="space-y-2">
        <label className="text-sm text-slate-300">Email</label>
        <input
          type="email" required
          className="w-full rounded-md bg-[#11161b] border border-white/10 px-3 py-2 outline-none"
          value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="owner@clientco.com"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm text-slate-300">Password</label>
        <input
          type="password" required
          className="w-full rounded-md bg-[#11161b] border border-white/10 px-3 py-2 outline-none"
          value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <button
        type="submit" disabled={busy}
        className="w-full rounded-md bg-white/90 text-black font-medium py-2 hover:bg-white disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {/* No signup link. You provision accounts. */}
    </form>
  );
}
