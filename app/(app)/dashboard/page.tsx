"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, BarChart, Bar
} from "recharts";
import RangePills from "@/components/RangePills";
import { normalizeService, priceFor as priceForFromNs, serviceLabelFor, type NormalizedService } from "@/lib/pricing";

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
}
function toNumber(x: unknown, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}
function mmdd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}
type Range = "7d" | "30d" | "90d";
type BizRow = { id: string; is_mobile: boolean };

type ApptRow = {
  id: number;
  business_id: string;
  start_ts: string;
  end_ts: string | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | "Completed" | string | null;
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  price_usd: number | string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_id: number | null;
  address_text: string | null;
};

type ServiceRow = {
  id: number;
  name: string;
  code: string;
  default_price_usd: number | string;
};

export default function DashboardPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [range, setRange] = useState<Range>("7d");

  const [biz, setBiz] = useState<BizRow | null>(null);
  const [rows, setRows] = useState<ApptRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);

  const svcById = useMemo(() => {
    const m = new Map<number, ServiceRow>();
    services.forEach((s) => m.set(s.id, s));
    return m;
  }, [services]);

  function daysFor(r: Range) { return r === "7d" ? 7 : r === "30d" ? 30 : 90; }
  function dateWindow(r: Range) {
    const days = daysFor(r);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const start = new Date(end); start.setDate(end.getDate() - (days - 1)); start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  // load biz + subscribe to toggle
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { data } = await supabase.from("businesses").select("id,is_mobile").maybeSingle<BizRow>();
      if (data) setBiz(data);
      if (data?.id) {
        const ch = supabase
          .channel("rt-biz-overview")
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "businesses", filter: `id=eq.${data.id}` },
            payload => setBiz(prev => prev ? { ...prev, is_mobile: !!(payload.new as any)?.is_mobile } : (payload.new as BizRow))
          )
          .subscribe();
        unsub = () => supabase.removeChannel(ch);
      }
    })();
    return () => { unsub?.(); };
  }, [supabase]);

  async function load() {
    if (!biz?.id) return;
    const { start, end } = dateWindow(range);

    const [{ data: appts }, { data: svcs }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id,business_id,start_ts,end_ts,status,service_raw,normalized_service,price_usd,caller_name,caller_phone_e164,service_id,address_text")
        .eq("business_id", biz.id)
        .gte("start_ts", start.toISOString())
        .lte("start_ts", end.toISOString())
        .order("start_ts", { ascending: true }),
      supabase
        .from("services")
        .select("id,name,code,default_price_usd")
        .eq("business_id", biz.id)
        .order("active", { ascending: false })
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
    ]);

    setRows((appts as any) ?? []);
    setServices((svcs as any) ?? []);
  }

  useEffect(() => { load(); }, [biz?.id, range]);

  useEffect(() => {
    if (!biz?.id) return;
    const ch = supabase
      .channel("rt-appointments-overview")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `business_id=eq.${biz.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [biz?.id]);

  function priceForRow(row: ApptRow): number {
    if ((row.status ?? "").toLowerCase() === "cancelled") return 0;
    const explicit = toNumber(row.price_usd, NaN);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    if (row.service_id != null) {
      const svc = svcById.get(row.service_id);
      if (svc) return toNumber(svc.default_price_usd, 0);
    }
    const ns = row.normalized_service ?? normalizeService(row.service_raw);
    return priceForFromNs(ns, toNumber(row.price_usd, 0));
  }

  const totals = useMemo(() => {
    const revenue = rows.reduce((sum, r) => sum + priceForRow(r), 0);
    return {
      bookings: rows.length,
      revenue,
      rescheduled: rows.filter((r) => (r.status || "").toLowerCase() === "rescheduled").length,
      cancelled: rows.filter((r) => (r.status || "").toLowerCase() === "cancelled").length,
    };
  }, [rows, svcById]);

  const bookingsSeries = useMemo(() => {
    const { start, end } = dateWindow(range);
    const map = new Map<string, number>();
    const d = new Date(start);
    while (d <= end) {
      map.set(mmdd(d), 0);
      d.setDate(d.getDate() + 1);
    }
    for (const r of rows) {
      const k = mmdd(new Date(r.start_ts));
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }, [rows, range]);

  const revenueByService = useMemo(() => {
    const sums = new Map<string, number>();
    for (const r of rows) {
      if ((r.status || "").toLowerCase() === "cancelled") continue;
      const ns = r.normalized_service ?? normalizeService(r.service_raw);
      let label: string;
      if (r.service_id != null) {
        const svc = svcById.get(r.service_id);
        label = svc?.name || serviceLabelFor(ns, r.service_raw) || "Other";
      } else {
        label = serviceLabelFor(ns, r.service_raw) || r.service_raw || "Other";
      }
      sums.set(label, (sums.get(label) ?? 0) + priceForRow(r));
    }
    return Array.from(sums.entries()).map(([service, revenue]) => ({ service, revenue }));
  }, [rows, svcById]);

  const showAddress = !!biz?.is_mobile;

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
                <XAxis dataKey="service" interval={0} tickMargin={12} />
                <YAxis width={40} />
                <Tooltip formatter={(v: any) => [fmtUSD(Number(v)), ""]} />
                <Bar dataKey="revenue" fill="#ffffff" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent appointments */}
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
                {showAddress && <th className="py-2 pr-4">Address</th>}
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(-10).map((r) => {
                const d = new Date(r.start_ts);
                const date = d.toLocaleDateString();
                const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

                let svcLabel = r.service_raw || (r.normalized_service as unknown as string) || "Service";
                if (r.service_id != null) {
                  const svc = svcById.get(r.service_id);
                  if (svc?.name) svcLabel = svc.name;
                } else {
                  const ns = r.normalized_service ?? normalizeService(r.service_raw);
                  svcLabel = serviceLabelFor(ns, r.service_raw) || svcLabel;
                }

                return (
                  <tr key={r.id} className="border-t border-cx-border">
                    <td className="py-2 pr-4">{date}</td>
                    <td className="py-2 pr-4">{time}</td>
                    <td className="py-2 pr-4">{svcLabel}</td>
                    <td className="py-2 pr-4">{r.caller_name ?? "—"}</td>
                    <td className="py-2 pr-4">{r.caller_phone_e164 ?? "—"}</td>
                    {showAddress && <td className="py-2 pr-4">{r.address_text ?? "—"}</td>}
                    <td className="py-2 pr-4"><StatusPill s={r.status} /></td>
                    <td className="py-2 pr-4">{fmtUSD(priceForRow(r))}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-cx-muted" colSpan={showAddress ? 8 : 7}>
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
