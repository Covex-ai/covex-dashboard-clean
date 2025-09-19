"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Brand from "./Brand";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/appointments", label: "Appointments" },
  { href: "/services", label: "Services" },
  { href: "/settings", label: "Settings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 flex-col border-r border-cx-border bg-cx-surface">
      <Brand />

      <nav className="flex-1 p-3">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`block px-4 py-2.5 rounded-xl mb-1 font-medium transition
                ${active ? "bg-cx-bg text-cx-text" : "text-cx-muted hover:text-cx-text hover:bg-cx-bg/60"}`}
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
