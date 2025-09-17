"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="w-full max-w-md rounded-2xl bg-cx-surface p-8 shadow-xl border border-cx-border">
        <div className="flex items-center gap-3 mb-6">
          <Image src="/covex.svg" alt="Covex" width={28} height={28} />
          <span className="text-lg font-semibold tracking-wide text-cx-text">Covex</span>
        </div>

        <h1 className="text-2xl font-semibold mb-2 text-cx-text">Sign in</h1>
        <p className="text-sm text-cx-muted mb-6">
          Accounts are provisioned by Covex. No public signups.
        </p>

        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            className="w-full rounded-xl bg-cx-bg px-4 py-3 outline-none border border-cx-border text-cx-text placeholder:text-cx-muted"
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full rounded-xl bg-cx-bg px-4 py-3 outline-none border border-cx-border text-cx-text placeholder:text-cx-muted"
          />
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full rounded-xl px-4 py-3 bg-cx-accent/90 hover:bg-cx-accent transition text-white font-medium"
          >
            Sign in
          </button>
        </div>

        <p className="text-xs text-cx-muted mt-6">
          By continuing, you agree to the Terms.
        </p>
      </div>
    </div>
  );
}
