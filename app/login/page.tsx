"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

const LOGO_SRC = "/brand-logo.png";

// Adjust these two if you ever want tiny tweaks later
const LOGO_HEIGHT_PX = 96; // keeps the logo a good size without crowding
const CARD_PADDING = "p-6 md:p-8"; // card inner padding

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [logoOk, setLogoOk] = useState(true);

  async function signIn() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) setMsg(error.message);
    else router.replace("/dashboard");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && !busy) void signIn();
  }

  return (
    <div className="min-h-screen grid place-items-center bg-cx-bg text-cx-text px-6" onKeyDown={onKeyDown}>
      <div className={`w-full max-w-xl bg-cx-surface border border-cx-border rounded-2xl ${CARD_PADDING}`}>
        {/* Clean, centered logo with normal spacing */}
        <div className="flex justify-center mb-5">
          {logoOk ? (
            <Image
              src={LOGO_SRC}
              alt="COVEX"
              width={2000}
              height={500}
              priority
              draggable={false}
              onError={() => setLogoOk(false)}
              className="opacity-95 object-contain"
              style={{ height: LOGO_HEIGHT_PX, width: "auto" }}
            />
          ) : (
            <span className="text-3xl font-semibold tracking-[0.35em] text-white">COVEX</span>
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
