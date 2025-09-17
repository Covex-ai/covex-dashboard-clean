export default function DashboardHome() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Analytics & Performance</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="covex-panel p-4">KPI 1</div>
        <div className="covex-panel p-4">KPI 2</div>
        <div className="covex-panel p-4">KPI 3</div>
        <div className="covex-panel p-4">KPI 4</div>
      </div>
    </div>
  );
}
