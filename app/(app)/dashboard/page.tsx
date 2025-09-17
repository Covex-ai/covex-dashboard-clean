export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Analytics & Performance</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] shadow-[0_6px_24px_rgba(0,0,0,.35)] p-4">KPI 1</div>
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] shadow-[0_6px_24px_rgba(0,0,0,.35)] p-4">KPI 2</div>
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] shadow-[0_6px_24px_rgba(0,0,0,.35)] p-4">KPI 3</div>
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] shadow-[0_6px_24px_rgba(0,0,0,.35)] p-4">KPI 4</div>
      </div>
    </div>
  );
}
