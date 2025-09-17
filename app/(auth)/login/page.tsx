// app/(auth)/login/page.tsx
"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);

    try {
      // If you’re using Supabase email/password:
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Login failed" }));
        throw new Error(error || "Login failed");
      }

      // go to dashboard
      window.location.href = "/";
    } catch (err: any) {
      setMsg(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b0f14] p-6 shadow-xl">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-wide">Covex</div>
          <div className="mt-1 text-sm text-slate-400">Sign in to your dashboard</div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <div className="mb-1 text-sm text-slate-300">Email</div>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-[#121a21] border border-white/10 px-3 py-2 outline-none"
              placeholder="you@company.com"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-sm text-slate-300">Password</div>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-[#121a21] border border-white/10 px-3 py-2 outline-none"
              placeholder="••••••••"
            />
          </label>

          {msg && <div className="text-sm text-red-400">{msg}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-white/90 text-black font-medium py-2 hover:bg-white disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
