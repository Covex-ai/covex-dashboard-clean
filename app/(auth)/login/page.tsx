"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");

    // TODO: swap with your real auth (Supabase or custom).
    // For now just accept anything and push into dashboard.
    window.location.href = "/dashboard";
  }

  return (
    <div className="grid place-items-center min-h-[70vh]">
      <div className="covex-panel w-full max-w-md p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="text-sm text-covex-mute mt-1">Access your Covex dashboard</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-covex-mute">Email</label>
            <input className="covex-input mt-1" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm text-covex-mute">Password</label>
            <input className="covex-input mt-1" type="password" value={pw} onChange={e => setPw(e.target.value)} required />
          </div>
          <button type="submit" className="covex-btn-dark w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {msg && <div className="text-sm mt-3 text-covex-mute">{msg}</div>}

        <div className="text-xs text-covex-mute mt-6">
          Your team creates accounts for you—no public sign-ups.
        </div>
      </div>
    </div>
  );
}
