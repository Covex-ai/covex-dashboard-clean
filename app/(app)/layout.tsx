import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-covex-bg">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex gap-4">
          <Sidebar />
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
