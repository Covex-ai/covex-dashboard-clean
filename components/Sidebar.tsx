"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

// ====== TUNE HERE ======
const LOGO_H = 240;        // keep the logo exactly this tall
const TOP_BOTTOM = 0.5;    // 0.5px top + 0.5px bottom
const HEADER_H = LOGO_H + TOP_BOTTOM * 2; // 241px total
const CONTENT_EXTRA = 8;   // content starts a little below the logo
const CONTENT_TOP = LOGO_H + CONTENT_EXTRA; // 248px

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
    <aside
      data-covex-sidebar
      className="hidden md:flex w-64 flex-col border-r border-cx-border bg-cx-bg"
      style={
        {
          ["--covex-header-h" as any]: `${HEADER_H}px`,
          ["--covex-content-top" as any]: `${CONTENT_TOP}px`,
        } as React.CSSProperties
      }
    >
      {/* Header is exactly logo height + 1px (0.5px top/bottom) */}
      <div
        className="border-b border-cx-border px-5 flex items-center justify-center"
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
            className="opacity-95 select-none"
            style={{ height: LOGO_H, width: "auto", objectFit: "contain" }}
          />
        ) : (
          <span className="text-2xl font-semibold tracking-[0.30em] text-white">COVEX</span>
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
        <button onClick={signOut} className="btn-pill w-full text-left">
          Sign out
        </button>
        <div className="text-xs text-cx-muted mt-3">© {new Date().getFullYear()} Covex</div>
      </div>

      {/* Nudge the main content down slightly (logo + a little) without touching layout.tsx */}
      <style jsx global>{`
        aside[data-covex-sidebar] + main > div {
          padding-top: var(--covex-content-top) !important;
        }
      `}</style>
    </aside>
  );
}
