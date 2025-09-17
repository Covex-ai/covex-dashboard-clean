export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Analytics & Performance</h1>
      <p className="text-slate-300">Clean baseline is live. We’ll wire data next.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-covexPanel p-4">KPI 1</div>
        <div className="rounded-xl border border-white/10 bg-covexPanel p-4">KPI 2</div>
        <div className="rounded-xl border border-white/10 bg-covexPanel p-4">KPI 3</div>
        <div className="rounded-xl border border-white/10 bg-covexPanel p-4">KPI 4</div>
      </div>
    </div>
  );
}
