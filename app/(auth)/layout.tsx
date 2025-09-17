// app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No sidebar or app shell here on purpose
  return <>{children}</>;
}
