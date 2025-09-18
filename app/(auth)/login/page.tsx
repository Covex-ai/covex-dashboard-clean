'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();

  function mockSignIn(e?: React.FormEvent) {
    e?.preventDefault();
    // Mock sign-in: just route into the app
    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <Image src="/covex.svg" alt="Covex" width={28} height={28} />
          <div className="text-[#dcdfe6] text-xl">Covex</div>
        </div>

        <form onSubmit={mockSignIn} className="space-y-3">
          <input
            className="w-full bg-[#0a0a0b] border border-[#22262e] rounded-xl px-3 py-2 text-[#dcdfe6] placeholder-[#9aa2ad]"
            placeholder="Email"
            type="email"
          />
          <input
            className="w-full bg-[#0a0a0b] border border-[#22262e] rounded-xl px-3 py-2 text-[#dcdfe6] placeholder-[#9aa2ad]"
            placeholder="Password"
            type="password"
          />
          <button
            type="submit"
            className="w-full bg-[#3b82f6] hover:opacity-90 text-white rounded-xl px-4 py-2"
          >
            Continue
          </button>
          <div className="text-xs text-[#9aa2ad]">
            Accounts are created by us — no public signups.
          </div>
        </form>
      </div>
    </div>
  );
}
