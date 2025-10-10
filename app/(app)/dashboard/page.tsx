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
function toNumber(x: unknown, fallback = 0): number { const n = Number(x); return Number.isFinite(n) ? n : fallback; }
function mmdd(d: Date) { const mm = String(d.getMonth() + 1).padStart(2, "0"); const dd = String(d.getDate()).padStart(2, "0"); return `${mm}-${dd}`; }

// ── NEW: canonicalize labels so tiny diffs don't create extra bars
const canon = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .replace(/[^\w\s/+.-]/g, "")
    .trim()
    .toLowerCase();

type Range = "7d" | "30d" | "90d";
type BizRow = { id: string; is_mobile: boolean };

type ApptRow = {
  id: number;
  business_id: string;
  start_ts: string | null;   // Inquiry can be null
  end_ts: string | null;
  status: string | null;
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
  code: string | null;
  default_price_usd: number | string | null;
  active?: boolean | null;
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

  // Map canonical key -> display label for known services
  const svcCanonToLabel = useMemo(() => {
    const m = new Map<string, string>();
    services.forEach(s => {
      const display = s.name || s.code || "Service";
      m.set(canon(display), display);
    });
    return m;
  }, [services]);

  function canonKeyForAppt(r: ApptRow): string {
    // prefer authoritative service_id
    if (r.service_id != null && svcById.has(r.service_id)) {
      const s = svcById.get(r.service_id)!;
      return canon(s.name || s.code || "Service");
    }
    // fallback from normalized/service_raw
    const ns = r.normalized_service ?? normalizeService(r.service_raw);
    const guessLabel = serviceLabelFor(ns, r.service_raw) || r.service_raw || "";
    const key = canon(guessLabel);
    return svcCanonToLabel.has(key) ? key : "unassigned";
  }

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
      const { data: prof } = await supabase.from("profiles").select("business_id").maybeSingle();
      const business_id = (prof as any)?.business_id;
      if (!business_id) return;
      const { data: bizRow } = await supabase.from("businesses").select("id,is_mobile").eq("id", business_id).maybeSingle<BizRow>();
      if (bizRow) setBiz(bizRow);
      if (business_id) {
        const ch = supabase
          .channel("rt-biz-overview")
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "businesses", filter: `id=eq.${business_id}` },
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
        // include Inquiry (no time) OR time-windowed rows
        .or(`status.ilike.inquiry%,and(start_ts.gte.${start.toISOString()},start_ts.lte.${end.toISOString()})`)
        .order("start_ts", { ascending: true }),
      supabase
        .from("services")
        .select("id,name,code,default_price_usd,active")
        .eq("business_id", biz.id)
        .order("active", { ascending: false })
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
    const status = (row.status ?? "").toLowerCase();
    if (status === "cancelled" || status === "inquiry") return 0;
    const explicit = toNumber(row.price_usd, NaN);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    if (row.service_id != null) {
      const svc = svcById.get(row.service_id);
      if (svc) return toNumber(svc.default_price_usd, 0);
    }
    const ns = row.normalized_service ?? normalizeService(row.service_raw);
    return priceForFromNs(ns, toNumber(row.price_usd, 0));
  }

  // Top cards
  const totals = useMemo(() => {
    const revenue = rows.reduce((sum, r) => sum + priceForRow(r), 0);
    const bookings = rows.filter(r => (r.status ?? "").toLowerCase() !== "inquiry").length;
    return {
      bookings,
      revenue,
      rescheduled: rows.filter((r) => (r.status || "").toLowerCase() === "rescheduled").length,
      cancelled: rows.filter((r) => (r.status || "").toLowerCase() === "cancelled").length,
    };
  }, [rows, svcById]);

  // Bookings per day (excludes Inquiry)
  const bookingsSeries = useMemo(() => {
    const { start, end } = dateWindow(range);
    const map = new Map<string, number>();
    const d = new Date(start);
    while (d <= end) { map.set(mmdd(d), 0); d.setDate(d.getDate() + 1); }
    for (const r of rows) {
      if ((r.status ?? "").toLowerCase() === "inquiry") continue;
      if (!r.start_ts) continue;
      const k = mmdd(new Date(r.start_ts));
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }, [rows, range]);
  const hasBookings = bookingsSeries.some(p => p.count > 0);

  // Revenue by service (excludes Inquiry/Cancelled; folds label variants)
  const revenueByService = useMemo(() => {
    const sums = new Map<string, number>();
    // seed all services (stable axis, even when zero)
    svcCanonToLabel.forEach((_label, key) => sums.set(key, 0));

    for (const r of rows) {
      const status = (r.status ?? "").toLowerCase();
      if (status === "cancelled" || status === "inquiry") continue;

      const key = canonKeyForAppt(r);
      if (key === "unassigned") continue; // ignore casing-only mismatches
      sums.set(key, (sums.get(key) ?? 0) + priceForRow(r));
    }

    return Array.from(sums.entries()).map(([key, revenue]) => ({
      service: svcCanonToLabel.get(key) || "Service",
      revenue,
    }));
  }, [rows, svcById, services, svcCanonToLabel]);
  const hasRevenue = revenueByService.some(r => r.revenue > 0);

  const showAddress = !!biz?.is_mobile;

  function StatusPill({ s }: { s: string | null }) {
    const v = (s ?? "").toLowerCase();
    const base = "px-2 py-1 rounded-lg text-xs font-medium border border-cx-border";
    if (v === "booked") return <span className={`${base} text-emerald-400`}>Booked</span>;
    if (v === "rescheduled") return <span className={`${base} text-amber-300`}>Rescheduled</span>;
    if (v === "cancelled") return <span className={`${base} text-rose-400`}>Cancelled</span>;
    if (v === "completed") return <span className={`${base} text-zinc-300`}>Completed</span>;
    if (v === "inquiry") return <span className={`${base} text-sky-300`}>Inquiry</span>;
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
            {hasBookings ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bookingsSeries}>
                  <CartesianGrid vertical={false} stroke="#1a1a1a" />
                  <XAxis dataKey="date" tickMargin={8} />
                  <YAxis allowDecimals={false} width={24} />
                  <Tooltip formatter={(v: any) => [`Bookings: ${v}`, ""]} />
                  <Line type="monotone" dataKey="count" stroke="#ffffff" dot={{ r: 3, fill: "#ffffff" }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-cx-muted text-sm">
                No bookings in this range.
              </div>
            )}
          </div>
        </div>

        <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Revenue by service (last {range})</h3>
            <RangePills value={range} onChange={setRange} />
          </div>
          <div className="h-72">
            {hasRevenue ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByService}>
                  <CartesianGrid vertical={false} stroke="#1a1a1a" />
                  {/* Hide tick labels to avoid crowding; tooltips still show names */}
                  <XAxis dataKey="service" hide tick={false} axisLine={false} tickLine={false} />
                  <YAxis width={40} />
                  <Tooltip formatter={(v: any) => [fmtUSD(Number(v)), ""]} />
                  <Bar dataKey="revenue" fill="#ffffff" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-cx-muted text-sm">
                No revenue in this range.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent inquiries (ONLY Inquiry, no date/time/price) */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Recent inquiries</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-cx-muted">
              <tr className="text-left">
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Phone</th>
                {showAddress && <th className="py-2 pr-4">Address</th>}
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter(r => (r.status ?? "").toLowerCase() === "inquiry")
                .slice(-10)
                .map((r) => {
                  let svcLabel = r.service_raw || (r.normalized_service as unknown as string) || "—";
                  if (r.service_id != null) {
                    const svc = svcById.get(r.service_id);
                    if (svc?.name) svcLabel = svc.name;
                  } else {
                    const ns = r.normalized_service ?? normalizeService(r.service_raw);
                    svcLabel = serviceLabelFor(ns, r.service_raw) || svcLabel;
                  }
                  return (
                    <tr key={r.id} className="border-t border-cx-border">
                      <td className="py-2 pr-4">{svcLabel}</td>
                      <td className="py-2 pr-4">{r.caller_name ?? "—"}</td>
                      <td className="py-2 pr-4">{r.caller_phone_e164 ?? "—"}</td>
                      {showAddress && <td className="py-2 pr-4">{r.address_text ?? "—"}</td>}
                      <td className="py-2 pr-4"><StatusPill s={r.status} /></td>
                    </tr>
                  );
                })}
              {rows.filter(r => (r.status ?? "").toLowerCase() === "inquiry").length === 0 && (
                <tr>
                  <td className="py-6 text-center text-cx-muted" colSpan={showAddress ? 5 : 4}>
                    No inquiries yet.
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

/* ---- fixed typings for StatCard ---- */
type StatCardProps = { title: string | number; value: string | number };

function StatCard({ title, value }: StatCardProps) {
  return (
    <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
      <div className="text-cx-muted text-sm mb-1">{typeof title === "string" ? title : String(title)}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
