"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

/** ===== TUNE HERE =====
 * LOGO_H stays 240px (your current visual size)
 * HEADER_H = LOGO_H + 4px  → 2px top + 2px bottom breathing room
 */
const LOGO_H = 240;
const HEADER_H = LOGO_H + 4; // 244px total height

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/appointments", label: "Appointments" },
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
    router.replace("/login");
  }

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-cx-border bg-cx-bg">
      {/* Header is exactly 244px tall; logo is centered at 240px high → 2px top/bottom */}
      <div
        className="relative border-b border-cx-border px-5"
        style={{ height: HEADER_H }}
      >
        {logoOk ? (
          <Image
            src={LOGO_SRC}
            alt="COVEX"
            width={2400}
            height={600}
            priority
            draggable={false}
            onError={() => setLogoOk(false)}
            className="pointer-events-none select-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-auto opacity-95"
            style={{ height: LOGO_H }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-semibold tracking-[0.30em] text-white">COVEX</span>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`block px-4 py-2.5 rounded-xl mb-1 font-medium transition
                ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-cx-muted hover:text-white hover:bg-white/5"
                }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-cx-border">
        <button onClick={signOut} className="btn-pill w-full text-left">Sign out</button>
        <div className="text-xs text-cx-muted mt-3">© {new Date().getFullYear()} Covex</div>
      </div>
    </aside>
  );
}
