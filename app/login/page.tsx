"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

const LOGO_SRC = "/brand-logo.png";

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

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
        {/* Much bigger logo */}
        <div className="flex justify-center mb-8">
          {logoOk ? (
            <Image
              src={LOGO_SRC}
              alt="COVEX"
              width={3000}
              height={750}
              className="opacity-95 h-28 w-auto object-contain"  // 112px-tall
              priority
              draggable={false}
              onError={() => setLogoOk(false)}
            />
          ) : (
            <span className="text-4xl font-semibold tracking-[0.35em] text-white">
              COVEX
            </span>
          )}
        </div>

        <h1 className="sr-only">Sign in to Covex</h1>

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
