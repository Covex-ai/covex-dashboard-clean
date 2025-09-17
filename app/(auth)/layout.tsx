export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-covex-bg">
      <header className="px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center">
          <a href="/" className="flex items-center gap-3">
            <img src="/covex.svg" alt="Covex" className="h-6 w-auto" />
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6">
        {children}
      </main>
    </div>
  );
}
