"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import RangePills from "@/components/RangePills";
import {
  priceFor,
  normalizeService,
  serviceLabelFor,
  toNumber,
} from "@/lib/pricing";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Bar,
  BarChart,
} from "recharts";

type Row = {
  id: string;
  start_ts: string;           // ISO
  status: "Booked" | "Rescheduled" | "Cancelled";
  service_raw: string | null;
  price_usd: number | string | null;
  normalized_service?: string | null;
};

type TipProps = { label?: string; payload?: any[] };

function Tip({ label, payload }: TipProps) {
  const val = payload?.[0]?.value;
  return (
    <div className="c-tip">
      <div style={{ opacity: 0.7 }}>{label}</div>
      <div style={{ marginTop: 2, fontWeight: 600 }}>{val}</div>
    </div>
  );
}

export default function Dashboard() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [bookingsRange, setBookingsRange] = useState<7 | 30 | 90>(90);
  const [revenueRange, setRevenueRange] = useState<7 | 30 | 90>(90);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id,start_ts,status,service_raw,price_usd,normalized_service"
        )
        .order("start_ts", { ascending: true });

      if (!error && data) setRows(data as Row[]);
      // If error, we just leave empty quietly (UI handles it)
    })();
  }, [supabase]);

  // Helper: constrain by range
  const since = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.getTime();
  };

  const rows90 = useMemo(
    () => rows.filter((r) => new Date(r.start_ts).getTime() >= since(90)),
    [rows]
  );

  // ---- Top stats (always 90d to match your tiles label) ----
  const totalBookings90 = rows90.filter((r) => r.status !== "Cancelled").length;

  const revenue90 = rows90
    .filter((r) => r.status !== "Cancelled")
    .reduce((sum, r) => {
      const norm = normalizeService(r.normalized_service ?? r.service_raw);
      return sum + priceFor(norm, r.price_usd);
    }, 0);

  const rescheduled90 = rows90.filter((r) => r.status === "Rescheduled").length;
  const cancelled90 = rows90.filter((r) => r.status === "Cancelled").length;

  // ---- Bookings per day (range switchable) ----
  const bookingsRows = useMemo(
    () => rows.filter((r) => new Date(r.start_ts).getTime() >= since(bookingsRange)),
    [rows, bookingsRange]
  );

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of bookingsRows) {
      const d = new Date(r.start_ts);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      map.set(label, (map.get(label) ?? 0) + (r.status !== "Cancelled" ? 1 : 0));
    }
    return Array.from(map.entries()).map(([day, bookings]) => ({ day, bookings }));
  }, [bookingsRows]);

  // ---- Revenue by service (range switchable) ----
  const revenueRows = useMemo(
    () => rows.filter((r) => new Date(r.start_ts).getTime() >= since(revenueRange)),
    [rows, revenueRange]
  );

  const revenueByService = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of revenueRows) {
      if (r.status === "Cancelled") continue;
      const norm = normalizeService(r.normalized_service ?? r.service_raw);
      const label = serviceLabelFor(norm, r.service_raw);
      const amt = priceFor(norm, r.price_usd);
      map.set(label, (map.get(label) ?? 0) + amt);
    }
    return Array.from(map.entries()).map(([service, revenue]) => ({
      service,
      revenue,
    }));
  }, [revenueRows]);

  const fmtUSD = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="p-6 space-y-6">
      {/* Top tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="c-card p-4">
          <div className="c-title">Bookings (90d)</div>
          <div className="c-stat mt-2">{totalBookings90}</div>
        </div>
        <div className="c-card p-4">
          <div className="c-title">Revenue (90d)</div>
          <div className="c-stat mt-2">{fmtUSD(revenue90)}</div>
        </div>
        <div className="c-card p-4">
          <div className="c-title">Rescheduled (90d)</div>
          <div className="c-stat mt-2">{rescheduled90}</div>
        </div>
        <div className="c-card p-4">
          <div className="c-title">Cancelled (90d)</div>
          <div className="c-stat mt-2">{cancelled90}</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bookings per day */}
        <div className="c-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="c-title">Bookings per day (last {bookingsRange}d)</div>
            <RangePills value={bookingsRange} onChange={(d) => setBookingsRange(d as 7 | 30 | 90)} ariaLabel="Bookings range" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: "#9ca3af", fontSize: 12 }} />
                <RTooltip content={<Tip />} />
                <Line
                  type="monotone"
                  dataKey="bookings"
                  stroke="var(--cx-line)"
                  strokeWidth={2.25}
                  dot={{ r: 4, fill: "var(--cx-dot)", stroke: "var(--cx-bg)", strokeWidth: 1.5 }}
                  activeDot={{ r: 5.5, stroke: "var(--cx-dot)", strokeWidth: 1.5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by service */}
        <div className="c-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="c-title">Revenue by service (last {revenueRange}d)</div>
            <RangePills value={revenueRange} onChange={(d) => setRevenueRange(d as 7 | 30 | 90)} ariaLabel="Revenue range" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByService}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="service"
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  interval={0}
                  height={40}
                />
                <YAxis
                  tick={{ fill: "#9ca3af", fontSize: 12 }}
                  tickFormatter={(v) => `$${v}`}
                />
                <RTooltip
                  content={({ label, payload }) => (
                    <div className="c-tip">
                      <div style={{ opacity: 0.7 }}>{label}</div>
                      <div style={{ marginTop: 2, fontWeight: 600 }}>
                        {fmtUSD(payload?.[0]?.value ?? 0)}
                      </div>
                    </div>
                  )}
                />
                <Bar dataKey="revenue" fill="var(--cx-bar)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent appointments */}
      <div className="c-card p-4">
        <div className="c-title mb-3">Recent appointments</div>
        <div className="overflow-x-auto">
          <table className="w-full c-table">
            <thead>
              <tr>
                <th className="py-2">Date</th>
                <th className="py-2">Time</th>
                <th className="py-2">Service</th>
                <th className="py-2">Name</th>
                <th className="py-2">Phone</th>
                <th className="py-2">Status</th>
                <th className="py-2">Price</th>
              </tr>
            </thead>
            <tbody>
              {[...rows90].reverse().slice(0, 8).map((r) => {
                const d = new Date(r.start_ts);
                const date = d.toLocaleDateString();
                const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                const norm = normalizeService(r.normalized_service ?? r.service_raw);
                const label = serviceLabelFor(norm, r.service_raw);
                const price = priceFor(norm, r.price_usd);
                const isCancelled = r.status === "Cancelled";
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--cx-border)", opacity: isCancelled ? 0.6 : 1 }}>
                    <td className="py-3 pr-3">{date}</td>
                    <td className="py-3 pr-3">{time}</td>
                    <td className="py-3 pr-3">{label}</td>
                    <td className="py-3 pr-3">—</td>
                    <td className="py-3 pr-3">—</td>
                    <td className="py-3 pr-3">{r.status}</td>
                    <td className="py-3">{price ? fmtUSD(price) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
