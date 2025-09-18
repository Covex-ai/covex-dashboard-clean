'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createBrowserClient } from '@/lib/supabaseBrowser';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createBrowserClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Image src="/covex.svg" alt="Covex" width={28} height={28} />
          <div className="text-[#dcdfe6] text-xl">Covex</div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input className="w-full bg-[#0a0a0b] border border-[#22262e] rounded-xl px-3 py-2 text-[#dcdfe6]"
                 placeholder="Email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
          <input className="w-full bg-[#0a0a0b] border border-[#22262e] rounded-xl px-3 py-2 text-[#dcdfe6]"
                 placeholder="Password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
          <button type="submit" disabled={loading}
                  className="w-full bg-[#3b82f6] hover:opacity-90 text-white rounded-xl px-4 py-2">
            {loading ? 'Signing in…' : 'Continue'}
          </button>
          {err && <div className="text-sm text-red-400">{err}</div>}
          <div className="text-xs text-[#9aa2ad]">Accounts are created by us — no public signups.</div>
        </form>
      </div>
    </div>
  );
}
