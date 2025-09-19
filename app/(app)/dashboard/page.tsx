"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import { priceFor, fmtUSD, serviceLabelFor } from "@/lib/pricing";

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar
} from "recharts";

// ---- Types ----
type Row = {
  id: string;
  start_ts: string;                // ISO
  normalized_service: string | null;
  service_raw: string | null;
  name: string | null;
  phone: string | null;
  source: string | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | string;
  price_usd: number | string | null;
};

function toNumber(n: number | string | null | undefined): number | null {
  if (n === null || n === undefined) return null;
  const num = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(num) ? num : null;
}

export default function DashboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserClient();

    // Last 90 days so we can roll different windows if needed
    const start = new Date();
    start.setDate(start.getDate() - 90);

    supabase
      .from("appointments")
      .select(
        "id,start_ts,normalized_service,service_raw,name,phone,source,status,price_usd"
      )
      .gte("start_ts", start.toISOString())
      .order("start_ts", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setRows(data as Row[]);
        setLoading(false);
      });
  }, []);

  // ---- Derived metrics (last 30 days) ----
  const last30Rows = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return rows.filter(r => new Date(r.start_ts) >= start);
  }, [rows]);

  const bookings30 = last30Rows.length;
  const rescheduled30 = last30Rows.filter(r => r.status === "Rescheduled").length;
  const cancelled30 = last30Rows.filter(r => r.status === "Cancelled").length;

  const revenue30 = useMemo(() => {
    return last30Rows
      .filter(r => r.status !== "Cancelled")
      .reduce((sum, r) => {
        const px = priceFor(r.normalized_service, toNumber(r.price_usd));
        return sum + (px ?? 0);
      }, 0);
  }, [last30Rows]);

  // ---- Chart: Bookings per day (30d) ----
  const bookingsPerDay = useMemo(() => {
    const today = new Date();
    const labels = Array.from({ length: 30 }).map((_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (29 - i));
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });

    return labels.map((lab) => {
      const count = last30Rows.filter(r => {
        const dt = new Date(r.start_ts);
        const label = `${dt.getMonth() + 1}/${dt.getDate()}`;
        return label === lab;
      }).length;
      return { day: lab, count };
    });
  }, [last30Rows]);

  // ---- Chart: Revenue by service (30d, exclude Cancelled) ----
  const revenueByService = useMemo(() => {
    const map = new Map<string, number>();
    last30Rows
      .filter(r => r.status !== "Cancelled")
      .forEach(r => {
        const label = serviceLabelFor(r.normalized_service, r.service_raw);
        const px = priceFor(r.normalized_service, toNumber(r.price_usd)) ?? 0;
        map.set(label, (map.get(label) ?? 0) + px);
      });

    // stable sort by revenue desc
    return Array.from(map.entries())
      .map(([service, revenue]) => ({ service, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [last30Rows]);

  if (loading) {
    return (
      <div className="p-6 text-cx-muted">Loading…</div>
    );
  }

  return (
    <div className="flex">
      {/* Sidebar is rendered by layout wrapper; this is the content area */}
      <div className="flex-1 min-h-screen bg-cx-bg">
        <div className="max-w-7xl mx-auto p-6 space-y-6">

          {/* -- KPIs -- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-cx-surface border border-cx-border rounded-xl p-4">
              <div className="text-sm text-cx-muted mb-1">Bookings (30d)</div>
              <div className="text-3xl font-semibold">{bookings30}</div>
            </div>
            <div className="bg-cx-surface border border-cx-border rounded-xl p-4">
              <div className="text-sm text-cx-muted mb-1">Revenue (30d)</div>
              <div className="text-3xl font-semibold">{fmtUSD(revenue30)}</div>
            </div>
            <div className="bg-cx-surface border border-cx-border rounded-xl p-4">
              <div className="text-sm text-cx-muted mb-1">Rescheduled (30d)</div>
              <div className="text-3xl font-semibold">{rescheduled30}</div>
            </div>
            <div className="bg-cx-surface border border-cx-border rounded-xl p-4">
              <div className="text-sm text-cx-muted mb-1">Cancelled (30d)</div>
              <div className="text-3xl font-semibold">{cancelled30}</div>
            </div>
          </div>

          {/* -- Charts -- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bookings per day (line + dots) */}
            <div className="bg-cx-surface border border-cx-border rounded-xl p-4 h-[320px]">
              <div className="text-sm text-cx-muted mb-3">Bookings per day (last 30 days)</div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bookingsPerDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickMargin={8} />
                  <YAxis allowDecimals={false} tickMargin={8} />
                  <Tooltip
                    contentStyle={{ background: "#0f1116", borderColor: "#22262e" }}
                    labelStyle={{ color: "#e5f5ff" }}
                    formatter={(v: number) => [v, "Bookings"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#e7e9ee"
                    strokeWidth={2}
                    dot={{ r: 4, stroke: "#0ea5e9", strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: "#0ea5e9" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue by service (bar) */}
            <div className="bg-cx-surface border border-cx-border rounded-xl p-4 h-[320px]">
              <div className="text-sm text-cx-muted mb-3">Revenue by service (last 30 days)</div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByService} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="service" interval={0} tickMargin={10} />
                  <YAxis tickMargin={8} />
                  <Tooltip
                    contentStyle={{ background: "#0f1116", borderColor: "#22262e" }}
                    labelStyle={{ color: "#e5f5ff" }}
                    formatter={(v: number) => [`${fmtUSD(v)}`, "Revenue"]}
                  />
                  <Bar dataKey="revenue" fill="#e7e9ee" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* -- Recent appointments -- */}
          <div className="bg-cx-surface border border-cx-border rounded-xl p-4">
            <div className="text-sm text-cx-muted mb-3">Recent appointments</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-cx-muted">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">Service</th>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Phone</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {last30Rows.slice(-10).reverse().map((r) => {
                    const dt = new Date(r.start_ts);
                    const date = dt.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
                    const time = dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
                    const label = serviceLabelFor(r.normalized_service, r.service_raw);
                    const price = priceFor(r.normalized_service, toNumber(r.price_usd));
                    const statusClass =
                      r.status === "Cancelled"
                        ? "badge"
                        : r.status === "Rescheduled"
                        ? "badge warning"
                        : "badge success";

                    return (
                      <tr key={r.id} className="border-t border-cx-border">
                        <td className="px-4 py-3">{date}</td>
                        <td className="px-4 py-3">{time}</td>
                        <td className="px-4 py-3">{label}</td>
                        <td className="px-4 py-3">{r.name ?? "-"}</td>
                        <td className="px-4 py-3">{r.phone ?? "-"}</td>
                        <td className="px-4 py-3">
                          <span className={statusClass}>{r.status}</span>
                        </td>
                        <td className="px-4 py-3">{price == null ? "-" : fmtUSD(price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
