"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

type Row = {
  normalized_service: "ACUTE_30" | "STANDARD_45" | "NEWPATIENT_60" | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | "Inquiry";
  price_usd: string | null;
};

const ranges = [
  { k: "7", days: 7 },
  { k: "30", days: 30 },
  { k: "90", days: 90 },
];

export default function ServicesPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [rangeKey, setRangeKey] = useState("30");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date();
      const r = ranges.find(r => r.k === rangeKey) ?? ranges[1];
      since.setDate(since.getDate() - r.days);
      const { data } = await supabase
        .from("appointments")
        .select("normalized_service,status,price_usd")
        .gte("start_ts", since.toISOString())
        .order("start_ts", { ascending: false })
        .limit(2000);
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, [rangeKey, supabase]);

  const agg = rows
    .filter(r => r.status !== "Cancelled")
    .reduce((acc, r) => {
      const key = r.normalized_service ?? "UNCLASSIFIED";
      const price = r.price_usd ? parseFloat(r.price_usd) : 0;
      acc[key] = acc[key] || { bookings: 0, revenue: 0 };
      acc[key].bookings += 1;
      acc[key].revenue += price;
      return acc;
    }, {} as Record<string, { bookings: number; revenue: number }>);

  const entries = Object.entries(agg);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Services</h1>
        <select
          value={rangeKey}
          onChange={e => setRangeKey(e.target.value)}
          className="rounded-xl bg-cx-surface border border-cx-border px-3 py-2 outline-none"
        >
          {ranges.map(r => <option key={r.k} value={r.k}>{`${r.k} days`}</option>)}
        </select>
      </div>

      <div className="rounded-2xl bg-cx-surface border border-cx-border shadow-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-cx-muted">
            <tr className="[&_th]:px-5 [&_th]:py-3 text-left">
              <th>Service</th><th>Bookings</th><th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-4 text-cx-muted" colSpan={3}>Loading…</td></tr>
            ) : entries.length === 0 ? (
              <tr><td className="px-5 py-6 text-cx-muted" colSpan={3}>No data in range.</td></tr>
            ) : entries.map(([svc, v]) => (
              <tr key={svc} className="border-t border-cx-border/70">
                <td className="px-5 py-3">{svc}</td>
                <td className="px-5 py-3">{v.bookings}</td>
                <td className="px-5 py-3">${v.revenue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
