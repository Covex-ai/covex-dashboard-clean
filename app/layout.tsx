import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Covex",
  description: "Covex Dashboard",
  icons: {
    icon: "/favicon.svg", // optional; copy covex-c.svg -> /public/favicon.svg
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-cx-bg text-cx-text">
      <body className="min-h-screen antialiased selection:bg-white/10 selection:text-white">
        {/* App shell */}
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-w-0 p-6 md:p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
