"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/appointments", label: "Appointments" },
  { href: "/calendar", label: "Calendar" },
  { href: "/services", label: "Services" },
  { href: "/settings", label: "Settings" },
];

const LOGO_SRC = "/brand-logo.png";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(), []);
  const [logoOk, setLogoOk] = useState(true);

  async function signOut() {
    await supabase.auth.signOut();
    document.cookie = "covex_session=; Max-Age=0; Path=/; SameSite=Lax";
    router.replace("/login");
  }

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-cx-border bg-cx-bg">
      <div className="h-20 px-5 flex items-center justify-center border-b border-cx-border">
        {logoOk ? (
          <Image
            src={LOGO_SRC}
            alt="COVEX"
            width={1600}
            height={400}
            className="opacity-95 h-32 w-auto object-contain"
            priority
            draggable={false}
            onError={() => setLogoOk(false)}
          />
        ) : (
          <span className="text-2xl font-semibold tracking-[0.3em] text-white">COVEX</span>
        )}
      </div>

      <nav className="flex-1 p-3">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`block px-4 py-2.5 rounded-xl mb-1 font-medium transition ${
                active ? "bg-white/10 text-white" : "text-cx-muted hover:text-white hover:bg-white/5"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-cx-border">
        {/* Red danger-styled Sign out button */}
        <button
          onClick={signOut}
          className="w-full text-left px-4 py-2.5 rounded-xl font-medium border transition
                     bg-rose-600/20 text-rose-300 border-rose-700/40
                     hover:bg-rose-600/30 hover:text-rose-200
                     focus:outline-none focus:ring-2 focus:ring-rose-500/40"
        >
          Sign out
        </button>
        <div className="text-xs text-cx-muted mt-3">© {new Date().getFullYear()} Covex</div>
      </div>
    </aside>
  );
}
