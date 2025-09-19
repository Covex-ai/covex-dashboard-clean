import "@/app/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Covex",
  description: "Covex",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-cx-bg text-cx-text">
      <body>{children}</body>
    </html>
  );
}
