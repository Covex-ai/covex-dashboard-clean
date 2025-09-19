"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import RangePills from "@/components/RangePills";
import {
  priceFor,
  normalizeService,
  serviceLabelFor,
} from "@/lib/pricing";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from "recharts";

type Row = {
  id: string;
  start_ts: string;
  status: "Booked" | "Rescheduled" | "Cancelled";
  service_raw: string | null;
  price_usd: number | string | null;
  normalized_service?: string | null;
};

function Tip({ label, payload }: { label?: string; payload?: any[] }) {
  const val = payload?.[0]?.value ?? 0;
  return (
    <div className="c-tip">
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div style={{ marginTop: 2, fontWeight: 600 }}>{val}</div>
    </div>
  );
}

export default function ServicesPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [range, setRange] = useState<7 | 30 | 90>(30);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id,start_ts,status,service_raw,price_usd,normalized_service")
        .order("start_ts", { ascending: true });
      if (!error && data) setRows(data as Row[]);
    })();
  }, [supabase]);

  // Filter by range
  const since = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.getTime();
  };
  const rowsR = useMemo(
    () => rows.filter((r) => new Date(r.start_ts).getTime() >= since(range)),
    [rows, range]
  );

  // Aggregate: bookings & revenue by service
  const agg = useMemo(() => {
    const map = new Map<string, { bookings: number; revenue: number }>();
    for (const r of rowsR) {
      const norm = normalizeService(r.normalized_service ?? r.service_raw);
      const label = serviceLabelFor(norm, r.service_raw);
      const price = r.status === "Cancelled" ? 0 : priceFor(norm, r.price_usd);
      const entry = map.get(label) ?? { bookings: 0, revenue: 0 };
      entry.bookings += r.status === "Cancelled" ? 0 : 1;
      entry.revenue += price;
      map.set(label, entry);
    }
    const list = Array.from(map.entries()).map(([service, v]) => ({
      service,
      bookings: v.bookings,
      revenue: v.revenue,
    }));
    list.sort((a, b) => b.revenue - a.revenue);
    return list;
  }, [rowsR]);

  const totalBookings = agg.reduce((s, a) => s + a.bookings, 0);
  const totalRevenue = agg.reduce((s, a) => s + a.revenue, 0);
  const top = agg[0];

  const fmtUSD = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="p-6 space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="c-card p-4">
          <div className="c-title">Top Service</div>
          <div className="mt-1 text-base">{top?.service ?? "—"}</div>
          <div className="text-sm text-[color:var(--cx-muted)]">
            {top ? `${top.bookings} bookings • ${fmtUSD(top.revenue)}` : "—"}
          </div>
        </div>
        <div className="c-card p-4">
          <div className="c-title">Total Bookings</div>
          <div className="c-stat mt-2">{totalBookings}</div>
        </div>
        <div className="c-card p-4">
          <div className="c-title">Revenue (excl. Cancelled)</div>
          <div className="c-stat mt-2">{fmtUSD(totalRevenue)}</div>
        </div>
      </div>

      {/* Range pills above chart, right aligned */}
      <div className="flex items-center justify-end">
        <RangePills value={range} onChange={(d) => setRange(d as 7 | 30 | 90)} ariaLabel="Services range" />
      </div>

      {/* Chart */}
      <div className="c-card p-4">
        <div className="c-title mb-3">Bookings by service (last {range}d)</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agg}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="service" interval={0} height={40} tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <RTooltip content={<Tip />} />
              <Bar dataKey="bookings" fill="var(--cx-bar)" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="c-card p-4">
        <div className="c-title mb-3">Services</div>
        <div className="overflow-x-auto">
          <table className="w-full c-table">
            <thead>
              <tr>
                <th className="py-2">Service</th>
                <th className="py-2">Bookings</th>
                <th className="py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {agg.map((s) => (
                <tr key={s.service} className="border-t" style={{ borderColor: "var(--cx-border)" }}>
                  <td className="py-3 pr-3">{s.service}</td>
                  <td className="py-3 pr-3">{s.bookings}</td>
                  <td className="py-3">{fmtUSD(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
