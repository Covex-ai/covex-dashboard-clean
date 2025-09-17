import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Covex",
  description: "Covex Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-cx-bg text-cx-text">
      <body>{children}</body>
    </html>
  );
}
