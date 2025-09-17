// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "Covex Dashboard",
  description: "Analytics & scheduling",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0b0f14] text-white antialiased">{children}</body>
    </html>
  );
}
