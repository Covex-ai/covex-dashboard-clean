// app/(auth)/login/page.tsx
"use client";

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold tracking-wide">Covex</div>
          <div className="mt-1 text-sm text-slate-400">Sign in to your dashboard</div>
        </div>

        {/* Replace with your real auth form/flow later; this is just to compile */}
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          <input
            type="email"
            placeholder="Email"
            className="w-full rounded bg-[#121a21] border border-white/10 p-3 outline-none"
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full rounded bg-[#121a21] border border-white/10 p-3 outline-none"
            required
          />
          <button
            type="submit"
            className="w-full rounded bg-white text-black font-medium py-3"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          Don’t see “Create account” here on purpose — accounts are created by you.
        </p>
      </div>
    </main>
  );
}
