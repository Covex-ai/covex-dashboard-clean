export default function Login() {
  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="text-center">
        <div className="text-2xl font-semibold">
          <span className="text-white">C</span>
          <span className="text-slate-300">ovex</span>
        </div>
        <div className="text-slate-400 text-sm mt-2">Sign in to your dashboard</div>
      </div>

      <form className="rounded-xl border border-white/10 bg-covexPanel p-4 space-y-3">
        <input
          type="email"
          placeholder="email@company.com"
          className="w-full bg-[#121a21] border border-white/10 rounded px-3 py-2 text-sm outline-none"
        />
        <input
          type="password"
          placeholder="••••••••"
          className="w-full bg-[#121a21] border border-white/10 rounded px-3 py-2 text-sm outline-none"
        />
        <button
          type="button"
          className="w-full px-4 py-2 rounded bg-white/10 hover:bg-white/20"
          disabled
          title="Auth wiring comes next"
        >
          Sign in
        </button>
      </form>

      <p className="text-center text-xs text-slate-500">Admin-provisioned only (no self-signup).</p>
    </div>
  );
}
