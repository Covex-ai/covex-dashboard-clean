export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-6">
        <div className="text-2xl font-semibold tracking-wide">
          <span>Covex</span>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-covex-panel p-6 shadow-lg">
          {children}
        </div>
      </main>
    </div>
  );
}
