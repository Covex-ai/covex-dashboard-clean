"use client";

import Image from "next/image";
import { useMemo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

const LOGO_SRC = "/brand-logo.png";
/** DO NOT CHANGE: keep logo exactly the same size */
const LOGO_HEIGHT_PX = 288;

/** Zero vertical padding on the grey box; keep horizontal padding the same */
const CARD_PADDING = "px-6 md:px-8 py-0 md:py-0";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [identifier, setIdentifier] = useState(""); // email OR username (sign-in)
  const [email, setEmail] = useState("");           // email (sign-up)
  const [username, setUsername] = useState("");     // username (sign-up)
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [logoOk, setLogoOk] = useState(true);
  const [redirectTo, setRedirectTo] = useState("/dashboard");

  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const r = sp.get("redirect");
      if (r) setRedirectTo(r);
    } catch {}
  }, []);

  function setGateCookie() {
    document.cookie = "covex_session=1; Max-Age=2592000; Path=/; SameSite=Lax";
  }

  async function resolveEmailForSignIn(id: string): Promise<string> {
    const trimmed = id.trim();
    if (!trimmed) return trimmed;
    if (trimmed.includes("@")) return trimmed;
    const { data } = await supabase.rpc("lookup_email_for_username", { u: trimmed });
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

    const { data: ok, error: availErr } = await supabase.rpc("is_username_available", {
      u: username.trim(),
    });
    if (availErr) {
      setBusy(false);
      return setMsg("Could not verify username availability. Try again.");
    }
    if (!ok) {
      setBusy(false);
      return setMsg("That username is taken. Please choose another.");
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: { data: { username: username.trim() } },
    });
    if (error) {
      setBusy(false);
      return setMsg(error.message);
    }

    try {
      const uid = data.user?.id;
      if (uid) {
        await supabase.from("profiles").update({ username: username.trim(), email }).eq("id", uid);
      }
    } catch {}

    setBusy(false);

    if (data.session) {
      setGateCookie();
      router.replace("/dashboard");
    } else {
      setMsg("Check your email to confirm your account, then sign in.");
      setMode("signin");
      setIdentifier(email);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (mode === "signin") await signIn();
    else await signUp();
  }

  return (
    <div className="min-h-screen grid place-items-center bg-cx-bg text-cx-text px-6">
      {/* Same width (max-w-xl). Vertical padding removed via CARD_PADDING. */}
      <div className={`login-card w-full max-w-xl bg-cx-surface border border-cx-border rounded-2xl ${CARD_PADDING}`}>
        {/* Logo: EXACT same size; no extra bottom margin */}
        <div className="flex justify-center mb-0">
          {logoOk ? (
            <Image
              src={LOGO_SRC}
              alt="COVEX"
              width={2000}
              height={500}
              priority
              draggable={false}
              onError={() => setLogoOk(false)}
              className="opacity-95 object-contain w-auto"
              style={{ height: LOGO_HEIGHT_PX, width: "auto" }}
            />
          ) : (
            <span className="text-3xl font-semibold tracking-[0.35em] text-white">COVEX</span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-0">
          {mode === "signin" ? (
            <div className="md:grid md:grid-cols-2 md:gap-2">
              {/* Labels are visually hidden to save vertical space */}
              <label className="sr-only" htmlFor="identifier">Email or username</label>
              <input
                id="identifier"
                aria-label="Email or username"
                className="w-full mb-1 md:mb-0 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none"
                placeholder="email@company.com or your-company"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
              />

              <label className="sr-only" htmlFor="password">Password</label>
              <input
                id="password"
                aria-label="Password"
                className="w-full mb-1 md:mb-0 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          ) : (
            <div className="md:grid md:grid-cols-3 md:gap-2">
              <label className="sr-only" htmlFor="username">Company username</label>
              <input
                id="username"
                aria-label="Company username"
                className="w-full mb-1 md:mb-0 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none"
                placeholder="your-company"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />

              <label className="sr-only" htmlFor="email">Email</label>
              <input
                id="email"
                aria-label="Email"
                className="w-full mb-1 md:mb-0 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />

              <label className="sr-only" htmlFor="newpassword">Password</label>
              <input
                id="newpassword"
                aria-label="Password"
                className="w-full mb-1 md:mb-0 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
          )}

          {msg && <div className="text-sm text-rose-400 mt-1 mb-1">{msg}</div>}

          <div className="flex items-center gap-3 mt-1">
            <button type="submit" disabled={busy} className="btn-pill btn-pill--active flex-1 justify-center">
              {busy ? (mode === "signin" ? "Signing in…" : "Creating account…") : (mode === "signin" ? "Sign in" : "Sign up")}
            </button>

            <button
              type="button"
              className="text-xs text-cx-muted hover:text-white underline underline-offset-4 whitespace-nowrap"
              onClick={() => { setMsg(null); setMode(mode === "signin" ? "signup" : "signin"); }}
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </div>
        </form>
      </div>

      <style jsx global>{`
        .login-card h1 { display: none !important; }
      `}</style>
    </div>
  );
}
