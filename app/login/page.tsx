"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

const LOGO_SRC = "/brand-logo.png";
const LOGO_HEIGHT_PX = 96;
const CARD_PADDING = "p-6 md:p-8";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const router = useRouter();
  const sp = useSearchParams();
  const redirectTo = sp.get("redirect") || "/dashboard";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [logoOk, setLogoOk] = useState(true);

  function setGateCookie() {
    // If your middleware expects a different cookie name, match it here
    document.cookie = "covex_session=1; Max-Age=2592000; Path=/; SameSite=Lax";
  }

  async function signIn() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) return setMsg(error.message);
    setGateCookie();
    router.replace(redirectTo);
  }

  async function signUp() {
    setBusy(true);
    setMsg(null);

    if (!email.trim() || !pw.trim() || !username.trim()) {
      setBusy(false);
      return setMsg("Email, username, and password are required.");
    }
    if (username.trim().length < 3) {
      setBusy(false);
      return setMsg("Username must be at least 3 characters.");
    }

    // 1) Create auth user and store username in user_metadata
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: { data: { username: username.trim() } },
    });
    if (error) {
      setBusy(false);
      return setMsg(error.message);
    }

    // 2) Optionally mirror username into public.profiles.username (see SQL below)
    try {
      const uid = data.user?.id;
      if (uid) {
        await supabase
          .from("profiles")
          .update({ username: username.trim() })
          .eq("id", uid);
      }
    } catch {
      // ignore; RLS/policy may block until SQL below is applied
    }

    setBusy(false);

    // 3) If you disabled email confirmations in Supabase → session exists now
    if (data.session) {
      setGateCookie();
      router.replace("/dashboard");
    } else {
      // If confirmations enabled, they must confirm before first sign-in
      setMsg("Check your email to confirm your account, then sign in.");
      setMode("signin");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && !busy) void (mode === "signin" ? signIn() : signUp());
  }

  return (
    <div className="min-h-screen grid place-items-center bg-cx-bg text-cx-text px-6" onKeyDown={onKeyDown}>
      <div className={`w-full max-w-xl bg-cx-surface border border-cx-border rounded-2xl ${CARD_PADDING}`}>
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

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
          <button
            className="btn-pill"
            onClick={() => {
              setMsg(null);
              setMode(mode === "signin" ? "signup" : "signin");
            }}
          >
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>

        {mode === "signup" && (
          <>
            <label className="block text-sm text-cx-muted mb-1">Company username</label>
            <input
              className="w-full mb-3 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
              placeholder="your-company"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </>
        )}

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
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
        />

        {msg && <div className="text-sm text-rose-400 mb-3">{msg}</div>}

        <button
          onClick={mode === "signin" ? signIn : signUp}
          disabled={busy}
          className="btn-pill btn-pill--active w-full justify-center"
        >
          {busy ? (mode === "signin" ? "Signing in…" : "Creating account…") : (mode === "signin" ? "Sign in" : "Sign up")}
        </button>

        <p className="text-xs text-cx-muted mt-4">
          Accounts are secured by Supabase Auth.
        </p>
      </div>
    </div>
  );
}
