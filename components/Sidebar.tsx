"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/appointments", label: "Appointments" },
  { href: "/services", label: "Services" },
  { href: "/settings", label: "Settings" },
];

const LOGO_SRC = "/brand-logo.png"; // 👈 Put your real logo at /public/brand-logo.png

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
      <div className="h-16 px-5 flex items-center gap-3 border-b border-cx-border">
        {logoOk ? (
          <Image
            src={LOGO_SRC}
            alt="COVEX"
            width={140}
            height={28}
            className="opacity-90 h-6 w-auto"
            priority
            onError={() => setLogoOk(false)}
          />
        ) : (
          // graceful fallback if logo missing
          <span className="font-semibold tracking-[0.2em] text-white">COVEX</span>
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
                ${active
                  ? "bg-white/10 text-white"
                  : "text-cx-muted hover:text-white hover:bg-white/5"}`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-cx-border">
        <button onClick={signOut} className="btn-pill w-full text-left">
          Sign out
        </button>
        <div className="text-xs text-cx-muted mt-3">
          © {new Date().getFullYear()} Covex
        </div>
      </div>
    </aside>
  );
