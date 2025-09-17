"use client";
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
    <aside className="hidden md:block w-60 shrink-0">
      <div className="covex-panel h-[calc(100vh-2rem)] sticky top-4 p-4">
        <div className="mb-6">
          <img src="/covex.svg" alt="Covex" className="h-5 w-auto opacity-90" />
        </div>
        <nav className="space-y-1">
          {links.map((l) => {
            const active = pathname?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`block px-3 py-2 rounded-lg border ${
                  active ? "bg-white/10 border-white/10" : "border-transparent hover:bg-white/5"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="covex-divider my-4"></div>
        <a href="/login" className="text-sm text-covex-mute hover:underline">Sign out</a>
      </div>
    </aside>
  );
}
