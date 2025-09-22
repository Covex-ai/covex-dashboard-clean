"use client";

import Image from "next/image";
import { useMemo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

const LOGO_SRC = "/brand-logo.png";
const LOGO_HEIGHT_PX = 96;
const CARD_PADDING = "p-6 md:p-8";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [identifier, setIdentifier] = useState(""); // email OR username (for sign-in)
  const [email, setEmail] = useState("");           // email (for sign-up)
  const [username, setUsername] = useState("");     // username (for sign-up)
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [logoOk, setLogoOk] = useState(true);
  const [redirectTo, setRedirectTo] = useState("/dashboard"); // default

  // Read ?redirect=... without useSearchParams (avoids Suspense requirement)
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const r = sp.get("redirect");
      if (r) setRedirectTo(r);
    } catch {}
  }, []);

  function setGateCookie() {
    // Match whatever your middleware expects
    document.cookie = "covex_session=1; Max-Age=2592000; Path=/; SameSite=Lax";
  }

  async function resolveEmailForSignIn(id: string): Promise<string> {
    const trimmed = id.trim();
    if (!trimmed) return trimmed;
    if (trimmed.includes("@")) return trimmed; // looks like email
    // Otherwise treat as username -> resolve via RPC
    const { data, error } = await supabase.rpc("lookup_email_for_username", { u: trimmed });
    if (error) return trimmed; // fallback, Supabase will error if wrong
    return data || trimmed;
  }

  async function signIn() {
    setBusy(true);
    setMsg(null);
    const loginEmail = await resolveEmailForSignIn(identifier);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: pw });
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

    // Pre-check username availability (RPC from earlier SQL)
    const { data: ok, error: availErr } = await supabase.rpc("is_username_available", { u: username.trim() });
    if (availErr) {
      setBusy(false);
      return setMsg("Could not verify username availability. Try again.");
    }
    if (!ok) {
      setBusy(false);
      return setMsg("That username is taken. Please choose another.");
    }

    // Create user; stash username in user_metadata
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: { data: { username: username.trim() } },
    });
    if (error) {
      setBusy(false);
      return setMsg(error.message);
    }

    // Mirror username into profiles.username (RLS policy from earlier SQL)
    try {
      const uid = data.user?.id;
      if (uid) {
        await supabase.from("profiles").update({ username: username.trim(), email }).eq("id", uid);
      }
    } catch {
      /* ignore if policy not yet applied */
    }

    setBusy(false);

    if (data.session) {
      setGateCookie();
      router.replace("/dashboard");
    } else {
      setMsg("Check your email to confirm your account, then sign in.");
      setMode("signin");
      setIdentifier(email); // prefill for convenience
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && !busy) void (mode === "signin" ? signIn() : signUp());
  }

  return (
    <div className="min-h-screen grid place-items-center bg-cx-bg text-cx-text px-6" onKeyDown={onKeyDown}>
      <div className={`w-full max-w-xl bg-cx-surface border border-cx-border rounded-2xl ${CARD_PADDING}`}>
        {/* Logo */}
        <div className="flex justify-center mb-6">
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

        {/* Centered mode toggle (segmented) */}
        <div className="flex justify-center mb-6">
          <div className="flex gap-2">
            <button
              className={`btn-pill ${mode === "signin" ? "btn-pill--active" : ""}`}
              onClick={() => { setMsg(null); setMode("signin"); }}
              type="button"
            >
              Sign in
            </button>
            <button
              className={`btn-pill ${mode === "signup" ? "btn-pill--active" : ""}`}
              onClick={() => { setMsg(null); setMode("signup"); }}
              type="button"
            >
              Sign up
            </button>
          </div>
        </div>

        {/* Form */}
        {mode === "signin" ? (
          <>
            <label className="block text-sm text-cx-muted mb-1">Email or username</label>
            <input
              className="w-full mb-3 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
              placeholder="email@company.com or your-company"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
            />
          </>
        ) : (
          <>
            <label className="block text-sm text-cx-muted mb-1">Company username</label>
            <input
              className="w-full mb-3 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
              placeholder="your-company"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />

            <label className="block text-sm text-cx-muted mb-1">Email</label>
            <input
              className="w-full mb-3 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </>
        )}

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

        {/* Secondary switch link below button for extra discoverability */}
        <div className="text-center mt-4">
          {mode === "signin" ? (
            <button
              type="button"
              className="text-cx-muted hover:text-white underline underline-offset-4"
              onClick={() => { setMsg(null); setMode("signup"); }}
            >
              Need an account? Sign up
            </button>
          ) : (
            <button
              type="button"
              className="text-cx-muted hover:text-white underline underline-offset-4"
              onClick={() => { setMsg(null); setMode("signin"); }}
            >
              Have an account? Sign in
            </button>
          )}
        </div>

        <p className="text-xs text-cx-muted mt-4 text-center">Accounts are secured by Supabase Auth.</p>
      </div>
    </div>
  );
}
