import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Covex Dashboard",
  description: "Multi-tenant analytics"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-white/10 bg-covexPanel/80 backdrop-blur">
          <div className="mx-auto max-w-6xl flex items-center gap-6 px-4 py-3">
            <Link href="/" className="text-xl font-semibold tracking-wide">
              <span className="text-white">C</span>
              <span className="text-slate-300">ovex</span>
            </Link>
            <nav className="text-sm text-slate-300 flex gap-4">
              <Link href="/appointments" className="hover:text-white">Appointments</Link>
              <Link href="/services" className="hover:text-white">Services</Link>
              <Link href="/settings" className="hover:text-white">Settings</Link>
              <Link href="/login" className="ml-2 text-slate-400 hover:text-white">Login</Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
