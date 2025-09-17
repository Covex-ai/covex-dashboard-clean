"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // TODO: wire real auth; for now go to dashboard
    window.location.href = "/dashboard";
  }

  return (
    <div className="grid place-items-center min-h-[70vh]">
      <div className="w-full max-w-md rounded-2xl border border-[#22262e] bg-[#0f1115] shadow-[0_6px_24px_rgba(0,0,0,.35)] p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-[#9aa2ad] mt-1">Access your Covex dashboard</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-[#9aa2ad]">Email</label>
            <input
              className="mt-1 w-full rounded-lg bg-[#0c0f14] border border-[#22262e] px-3 py-2 text-sm outline-none focus:border-[#3b82f6]"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-sm text-[#9aa2ad]">Password</label>
            <input
              className="mt-1 w-full rounded-lg bg-[#0c0f14] border border-[#22262e] px-3 py-2 text-sm outline-none focus:border-[#3b82f6]"
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center rounded-lg bg-[#3b82f6] text-white font-medium px-4 py-2 hover:opacity-90 transition"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="text-xs text-[#9aa2ad] mt-6">
          Accounts are created by your team—no public sign-ups.
        </div>
      </div>
    </div>
  );
}
