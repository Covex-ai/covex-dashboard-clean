"use client";

import Image from "next/image";
import { useMemo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

const LOGO_SRC = "/brand-logo.png";
/** KEEPING LOGO SIZE EXACTLY THE SAME AS YOUR CURRENT SETTING */
const LOGO_HEIGHT_PX = 288; // <-- do not change if your current is different, set it back to whatever you use
/** keep your existing padding */
const CARD_PADDING = "px-6 py-2.5 md:px-8 md:py-3.5";

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
      {/* ↓ 25% narrower card: 36rem (max-w-xl) → 27rem */}
      <div className={`login-card w-full max-w-[27rem] bg-cx-surface border border-cx-border rounded-2xl ${CARD_PADDING}`}>
        {/* Logo (KEEPING SAME SIZE) */}
        <div className="flex justify-center mb-3">
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

        <form onSubmit={handleSubmit}>
          {mode === "signin" ? (
            <>
              <label className="block text-sm text-cx-muted mb-1">Email or username</label>
              <input
                className="w-full mb-2 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
                placeholder="email@company.com or your-company"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
              />
            </>
          ) : (
            <>
              <label className="block text-sm text-cx-muted mb-1">Company username</label>
              <input
                className="w-full mb-2 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
                placeholder="your-company"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
              <label className="block text-sm text-cx-muted mb-1">Email</label>
              <input
                className="w-full mb-2 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </>
          )}

          <label className="block text-sm text-cx-muted mb-1">Password</label>
          <input
            className="w-full mb-2 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
          />

          {msg && <div className="text-sm text-rose-400 mb-2">{msg}</div>}

          <button type="submit" disabled={busy} className="btn-pill btn-pill--active w-full justify-center">
            {busy ? (mode === "signin" ? "Signing in…" : "Creating account…") : (mode === "signin" ? "Sign in" : "Sign up")}
          </button>

          <div className="text-center mt-2">
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
        </form>
      </div>

      {/* Safety: hide any stray h1 injected by other code */}
      <style jsx global>{`
        .login-card h1 { display: none !important; }
      `}</style>
    </div>
  );
}
