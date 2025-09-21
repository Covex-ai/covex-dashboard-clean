"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, BarChart, Bar } from "recharts";
import RangePills from "@/components/RangePills";

// Utilities
function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
}
function toNumber(x: unknown, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

type Range = "7d" | "30d" | "90d";

type ApptRow = {
  id: number;
  start_ts: string;
  end_ts: string | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | "Completed" | string | null;
  service_raw: string | null;
  normalized_service: string | null;
  price_usd: number | string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_id: number | null;
  address_text?: string | null;
};

type ServiceRow = {
  id: number;
  name: string;
  code: string;
  default_price_usd: number | string;
};

export default function DashboardPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [range, setRange] = useState<Range>("7d"); // DEFAULT 7d
  const [rows, setRows] = useState<ApptRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);

  // Map for fast lookups
  const svcById = useMemo(() => {
    const m = new Map<number, ServiceRow>();
    services.forEach(s => m.set(s.id, s));
    return m;
  }, [services]);

  function daysFor(r: Range) {
    return r === "7d" ? 7 : r === "30d" ? 30 : 90;
  }

  async function load() {
    const days = daysFor(range);
    const from = new Date();
    from.setDate(from.getDate() - days);

    const [{ data: appts }, { data: svcs }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id,start_ts,end_ts,status,service_raw,normalized_service,price_usd,caller_name,caller_phone_e164,service_id,address_text")
        .gte("start_ts", from.toISOString())
        .order("start_ts", { ascending: true }),
      supabase
        .from("services")
        .select("id,name,code,default_price_usd")
        .order("active", { ascending: false })
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
    ]);

    setRows((appts as any) ?? []);
    setServices((svcs as any) ?? []);
  }

  useEffect(() => { load(); }, [range]);

  // realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel("rt-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Revenue helper: prefer service_id -> default_price_usd; fallback to price_usd
  function priceFor(row: ApptRow): number {
    if (row.status === "Cancelled") return 0; // excluded from revenue
    if (row.service_id != null) {
      const svc = svcById.get(row.service_id);
      if (svc) return toNumber(svc.default_price_usd, 0);
    }
    return toNumber(row.price_usd, 0);
  }

  // Name/phone helpers (your actual schema)
  function personName(r: ApptRow) {
    return r.caller_name ?? "—";
  }
  function personPhone(r: ApptRow) {
    return r.caller_phone_e164 ?? "—";
  }

  // Totals
  const totals = useMemo(() => {
    const revenue = rows.reduce((sum, r) => sum + priceFor(r), 0);
    return {
      bookings: rows.length,
      revenue,
      rescheduled: rows.filter(r => (r.status || "").toLowerCase() === "rescheduled").length,
      cancelled: rows.filter(r => (r.status || "").toLowerCase() === "cancelled").length,
    };
  }, [rows, svcById]);

  // Bookings per day series
  const bookingsSeries = useMemo(() => {
    const days = daysFor(range);
    const map = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(5, 10); // MM-DD
      map.set(key, 0);
    }
    for (const r of rows) {
      const d = new Date(r.start_ts);
      const key = d.toISOString().slice(5, 10);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }, [rows, range]);

  // Revenue by service (prefer service_id->name, else fallback to normalized/service_raw)
  const revenueByService = useMemo(() => {
    const sums = new Map<string, number>(); // key = label
    for (const r of rows) {
      if ((r.status || "").toLowerCase() === "cancelled") continue;
      let label: string;
      if (r.service_id != null) {
        const svc = svcById.get(r.service_id);
        label = svc?.name || "Other";
      } else {
        label = r.normalized_service || r.service_raw || "Other";
      }
      sums.set(label, (sums.get(label) ?? 0) + priceFor(r));
    }
    return Array.from(sums.entries()).map(([service, revenue]) => ({ service, revenue }));
  }, [rows, svcById]);

  // Status chip
  function StatusPill({ s }: { s: string | null }) {
    const v = (s ?? "").toLowerCase();
    const base = "px-2 py-1 rounded-lg text-xs font-medium border border-cx-border";
    if (v === "booked") return <span className={`${base} text-emerald-400`}>Booked</span>;
    if (v === "rescheduled") return <span className={`${base} text-amber-300`}>Rescheduled</span>;
    if (v === "cancelled") return <span className={`${base} text-rose-400`}>Cancelled</span>;
    if (v === "completed") return <span className={`${base} text-zinc-300`}>Completed</span>;
    return <span className={`${base} text-cx-muted`}>{s ?? "-"}</span>;
  }

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title={`Bookings (${range})`} value={totals.bookings} />
        <StatCard title={`Revenue (${range})`} value={fmtUSD(totals.revenue)} />
        <StatCard title={`Rescheduled (${range})`} value={totals.rescheduled} />
        <StatCard title={`Cancelled (${range})`} value={totals.cancelled} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Bookings per day (last {range})</h3>
            <RangePills value={range} onChange={setRange} />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bookingsSeries}>
                <CartesianGrid vertical={false} stroke="#1a1a1a" />
                <XAxis dataKey="date" tickMargin={8} />
                <YAxis allowDecimals={false} width={24} />
                <Tooltip formatter={(v: any) => [`Bookings: ${v}`, ""]} />
                <Line type="monotone" dataKey="count" stroke="#ffffff" dot={{ r: 3, fill: "#ffffff" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Revenue by service (last {range})</h3>
            <RangePills value={range} onChange={setRange} />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByService}>
                <CartesianGrid vertical={false} stroke="#1a1a1a" />
                <XAxis dataKey="service" interval={0} angle={0} tickMargin={12} />
                <YAxis width={40} />
                <Tooltip formatter={(v: any) => [fmtUSD(Number(v)), ""]} />
                <Bar dataKey="revenue" fill="#ffffff" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent table (now uses caller_* fields + status chips) */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Recent appointments</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-cx-muted">
              <tr className="text-left">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(-10).map((r) => {
                const d = new Date(r.start_ts);
                const date = d.toLocaleDateString();
                const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

                // Prefer service name via service_id
                let svcLabel = r.service_raw || r.normalized_service || "Service";
                if (r.service_id != null) {
                  const svc = svcById.get(r.service_id);
                  if (svc?.name) svcLabel = svc.name;
                }

                return (
                  <tr key={r.id} className="border-t border-cx-border">
                    <td className="py-2 pr-4">{date}</td>
                    <td className="py-2 pr-4">{time}</td>
                    <td className="py-2 pr-4">{svcLabel}</td>
                    <td className="py-2 pr-4">{personName(r)}</td>
                    <td className="py-2 pr-4">{personPhone(r)}</td>
                    <td className="py-2 pr-4"><StatusPill s={r.status} /></td>
                    <td className="py-2 pr-4">{fmtUSD(priceFor(r))}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-cx-muted" colSpan={7}>
                    No appointments in the selected range.
                  </td>
                </tr>
              )}
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
