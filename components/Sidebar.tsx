"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/appointments", label: "Appointments" },
  { href: "/services", label: "Services" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-cx-border bg-cx-bg">
      <div className="h-16 px-5 flex items-center gap-3 border-b border-cx-border">
        {/* Preferred: silver/cutout wordmark */}
        <Image
          src="/covex-wordmark.svg"
          alt="COVEX"
          width={90}
          height={20}
          className="opacity-90"
          priority
        />
        {/* If SVG missing, fallback text:
        <span className="font-semibold tracking-[0.2em] text-white">COVEX</span>
        */}
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

      <div className="p-4 border-t border-cx-border text-xs text-cx-muted">
        © {new Date().getFullYear()} Covex
      </div>
    </aside>
  );
}
