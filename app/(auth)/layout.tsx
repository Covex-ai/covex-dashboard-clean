// app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No sidebar/header here on purpose
  return <>{children}</>;
}
