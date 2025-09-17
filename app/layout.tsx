import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Covex Dashboard",
  description: "Modern front desk — on brand."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-covex-bg text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
