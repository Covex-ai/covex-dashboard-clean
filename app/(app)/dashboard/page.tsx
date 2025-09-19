"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import RangePills from "@/components/RangePills";
import {
  fmtUSD,
  normalizeService,
  priceFor,
  serviceLabelFor,
  toNumber,
  type NormalizedService,
} from "@/lib/pricing";

type Range = "7d" | "30d" | "90d";

type ApptRow = {
  id: number;
  business_uuid: string;
  start_ts: string | null; // may be null in some sources
  end_ts: string | null;
  created_at?: string | null;
  // name/phone may come in as caller_* from upstream
  name: string | null;
  phone: string | null;
  caller_name?: string | null;
  caller_phone_e164?: string | null;

  status: string | null; // raw -> we'll normalize
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  price_usd: number | string | null;
  updated_at: string | null;
};

// ---------- status helpers (same look as Appointments page) ----------
type Status = "Booked" | "Rescheduled" | "Cancelled" | "Completed";

function normalizeStatus(s: string | null | undefined): Status | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (t === "booked") return "Booked";
  if (t === "rescheduled") return "Rescheduled";
  if (t === "cancelled") return "Cancelled";
  if (t === "completed") return "Completed";
  return null;
}

function getWhen(row: ApptRow): Date | null {
  const a = row.start_ts ? new Date(row.start_ts) : null;
  const b = row.end_ts ? new Date(row.end_ts) : null;
  const c = row.created_at ? new Date(row.created_at) : null;
  return a ?? b ?? c ?? null;
}

function isCompleted(row: ApptRow): boolean {
  const st = normalizeStatus(row.status);
  if (st === "Cancelled") return false;
  if (st === "Completed") return true;
  const when = getWhen(row);
  if (!when) return false;
  return when.getTime() < Date.now();
}

function StatusBadge({ value }: { value: Status | null }) {
  const base =
    "inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border";
  if (value === "Booked")
    return (
      <span className={`${base} border-emerald-700/40 bg-emerald-500/15 text-emerald-300`}>
        Booked
      </span>
    );
  if (value === "Rescheduled")
    return (
      <span className={`${base} border-amber-700/40 bg-amber-500/15 text-amber-300`}>
        Rescheduled
      </span>
    );
  if (value === "Cancelled")
    return (
      <span className={`${base} border-rose-700/40 bg-rose-500/15 text-rose-300`}>
        Cancelled
      </span>
    );
  if (value === "Completed")
    return (
      <span className={`${base} border-white/20 bg-white/10 text-cx-muted`}>
        Completed
      </span>
    );
  return <span className={`${base} border-cx-border text-cx-muted`}>-</span>;
}
// --------------------------------------------------------------------

export default function DashboardPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [range, setRange] = useState<Range>("7d"); // <-- default now 7d
  const [rows, setRows] = useState<ApptRow[]>([]);

  function daysFor(r: Range) {
    return r === "7d" ? 7 : r === "30d" ? 30 : 90;
  }

  async function load() {
    const days = daysFor(range);
    const from = new Date();
    from.setDate(from.getDate() - days);
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .gte("start_ts", from.toISOString())
      .order("start_ts", { ascending: true });
    if (!error && data) setRows(data as any);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // realtime subscription
  useEffect(() => {
    const ch = supabase
      .channel("rt-appointments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Totals (exclude Cancelled from revenue)
  const totals = useMemo(() => {
    const relevant = rows.filter((r) => normalizeStatus(r.status) !== "Cancelled");
    const revenue = relevant.reduce((sum, r) => {
      const ns = r.normalized_service ?? normalizeService(r.service_raw);
      return sum + priceFor(ns, toNumber(r.price_usd));
    }, 0);
    return {
      bookings: rows.length,
      revenue,
      rescheduled: rows.filter((r) => normalizeStatus(r.status) === "Rescheduled").length,
      cancelled: rows.filter((r) => normalizeStatus(r.status) === "Cancelled").length,
    };
  }, [rows]);

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
      const when = getWhen(r);
      if (!when) continue;
      const key = when.toISOString().slice(5, 10);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }, [rows, range]);

  // Revenue by service series (exclude Cancelled)
  const revenueByService = useMemo(() => {
    const sums = new Map<NormalizedService | "OTHER", number>();
    const add = (k: NormalizedService | "OTHER", v: number) =>
      sums.set(k, (sums.get(k) ?? 0) + v);

    for (const r of rows) {
      if (normalizeStatus(r.status) === "Cancelled") continue;
      const s = r.normalized_service ?? normalizeService(r.service_raw) ?? "OTHER";
      const v = priceFor(s === "OTHER" ? null : s, toNumber(r.price_usd));
      add(s, v);
    }
    return Array.from(sums.entries()).map(([s, v]) => ({
      service:
        s === "OTHER" ? "Other" : serviceLabelFor(s as NormalizedService, null),
      revenue: v,
    }));
  }, [rows]);

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
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#ffffff"
                  dot={{ r: 3, fill: "#ffffff" }}
                />
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

      {/* Recent table with status badges + name/phone fallback */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h3 className="font-semibold mb-3">Recent appointments</h3>
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
                const ns = r.normalized_service ?? normalizeService(r.service_raw);
                const st = normalizeStatus(r.status) ?? (isCompleted(r) ? "Completed" : null);
                const when = getWhen(r);
                const name = r.name ?? r.caller_name ?? "—";
                const phone = r.phone ?? r.caller_phone_e164 ?? "—";

                return (
                  <tr key={r.id} className="border-top border-cx-border">
                    <td className="py-2 pr-4">{when ? when.toLocaleDateString() : "—"}</td>
                    <td className="py-2 pr-4">
                      {when ? when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="py-2 pr-4">{serviceLabelFor(ns, r.service_raw)}</td>
                    <td className="py-2 pr-4">{name}</td>
                    <td className="py-2 pr-4">{phone}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={st} />
                    </td>
                    <td className="py-2 pr-4">
                      {fmtUSD(priceFor(ns, toNumber(r.price_usd)))}
                    </td>
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
