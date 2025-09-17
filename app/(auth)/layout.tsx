export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cx-bg">
      {children}
    </div>
  );
}
