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
    <aside
      className="hidden md:flex w-64 shrink-0 flex-col border-r border-cx-border bg-cx-surface/95 backdrop-blur-sm"
      aria-label="Sidebar"
    >
      {/* Brand */}
      <div className="h-16 px-5 flex items-center gap-2 border-b border-cx-border">
        <Image src="/covex-c.svg" alt="Covex icon" width={18} height={18} priority />
        <Image src="/covex-wordmark.svg" alt="Covex" width={112} height={28} priority />
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3">
        <ul className="space-y-1">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "group relative block rounded-xl px-4 py-2.5 font-medium transition-colors",
                    active
                      ? "bg-cx-bg text-cx-text"
                      : "text-cx-muted hover:text-cx-text hover:bg-cx-bg/60",
                  ].join(" ")}
                >
                  {/* Left active indicator */}
                  <span
                    className={[
                      "absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-full",
                      active ? "bg-white" : "bg-transparent group-hover:bg-white/70",
                    ].join(" ")}
                    aria-hidden
                  />
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-cx-border text-xs text-cx-muted">
        © {new Date().getFullYear()} Covex
      </div>
    </aside>
  );
}
