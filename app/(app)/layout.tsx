import type { Metadata } from "next";
import "@/app/globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Covex Dashboard",
  description: "Covex Dashboard",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-cx-bg text-cx-text">
      <body>
        <div className="flex min-h-screen bg-cx-bg text-cx-text">
          {/* SINGLE sidebar – do not render Sidebar in any page */}
          <Sidebar />
          <main className="flex-1">
            {/* Back to normal page padding */}
            <div className="mx-auto max-w-[1200px] px-6 py-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
