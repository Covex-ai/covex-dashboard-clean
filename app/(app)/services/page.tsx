"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import RangePills from "@/components/RangePills";
import { fmtUSD, normalizeService, priceFor, serviceLabelFor, toNumber, type NormalizedService } from "@/lib/pricing";

type Range = "7d" | "30d" | "90d";

type ApptRow = {
  id: number;
  start_ts: string;
  status: string | null;
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  price_usd: number | string | null;
};

export default function ServicesPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [range, setRange] = useState<Range>("30d");
  const [rows, setRows] = useState<ApptRow[]>([]);

  function daysFor(r: Range) { return r === "7d" ? 7 : r === "30d" ? 30 : 90; }

  async function load() {
    const days = daysFor(range);
    const from = new Date();
    from.setDate(from.getDate() - days);
    const { data } = await supabase
      .from("appointments")
      .select("id,start_ts,status,service_raw,normalized_service,price_usd")
      .gte("start_ts", from.toISOString())
      .order("start_ts", { ascending: true });
    setRows((data as any) ?? []);
  }

  useEffect(() => { load(); }, [range]);

  const groups = useMemo(() => {
    type Bucket = { label: string; bookings: number; revenue: number };
    const map = new Map<string, Bucket>();

    for (const r of rows) {
      const ns = r.normalized_service ?? normalizeService(r.service_raw);
      const key = ns ?? "OTHER";
      const label = ns ? serviceLabelFor(ns, r.service_raw) : (r.service_raw ?? "Other");

      if (!map.has(key)) map.set(key, { label, bookings: 0, revenue: 0 });

      const b = map.get(key)!;
      b.bookings += 1;
      if (r.status !== "Cancelled") {
        b.revenue += priceFor(ns, toNumber(r.price_usd));
      }
    }

    return Array.from(map.values());
  }, [rows]);

  const totalBookings = groups.reduce((a, b) => a + b.bookings, 0);
  const totalRevenue = groups.reduce((a, b) => a + b.revenue, 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Top Service" value={groups.slice().sort((a,b)=>b.bookings-a.bookings)[0]?.label ?? "-"} />
        <StatCard title="Total Bookings" value={totalBookings} />
        <StatCard title="Revenue (excl. Cancelled)" value={fmtUSD(totalRevenue)} />
      </div>

      {/* Chart with range pills ABOVE, right aligned */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Bookings by service (last {range})</h3>
          <RangePills value={range} onChange={setRange} />
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={groups}>
              <CartesianGrid vertical={false} stroke="#1a1a1a" />
              <XAxis dataKey="label" interval={0} tickMargin={12} />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(v: any, n: string) => n === "bookings" ? [`Bookings: ${v}`, ""] : [fmtUSD(Number(v)), ""]} />
              <Bar dataKey="bookings" fill="#ffffff" radius={[8,8,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-cx-muted">
              <tr className="text-left">
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4">Bookings</th>
                <th className="py-2 pr-4">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.label} className="border-t border-cx-border">
                  <td className="py-2 pr-4">{g.label}</td>
                  <td className="py-2 pr-4">{g.bookings}</td>
                  <td className="py-2 pr-4">{fmtUSD(g.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
      <div className="text-cx-muted text-sm mb-1">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
