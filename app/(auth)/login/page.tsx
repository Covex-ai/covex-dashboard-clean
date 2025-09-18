"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  async function handleSignIn() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setMsg(error.message); return; }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="w-full max-w-md rounded-2xl bg-cx-surface p-8 shadow-xl border border-cx-border">
        <div className="flex items-center gap-3 mb-6">
          <Image src="/covex.svg" alt="Covex" width={28} height={28} />
          <span className="text-lg font-semibold tracking-wide text-cx-text">Covex</span>
        </div>

        <h1 className="text-2xl font-semibold mb-2 text-cx-text">Sign in</h1>
        <p className="text-sm text-cx-muted mb-6">Accounts are provisioned by Covex.</p>

        <div className="space-y-3">
          <input
            type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
            className="w-full rounded-xl bg-cx-bg px-4 py-3 outline-none border border-cx-border text-cx-text placeholder:text-cx-muted"
          />
          <input
            type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}
            className="w-full rounded-xl bg-cx-bg px-4 py-3 outline-none border border-cx-border text-cx-text placeholder:text-cx-muted"
          />
          <button
            onClick={handleSignIn}
            className="w-full rounded-xl px-4 py-3 bg-cx-accent/90 hover:bg-cx-accent transition text-white font-medium"
          >
            Sign in
          </button>
          {msg && <p className="text-sm text-cx-muted">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
