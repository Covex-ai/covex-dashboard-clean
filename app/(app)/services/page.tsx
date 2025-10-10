"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import RangePills from "@/components/RangePills";
import { fmtUSD, normalizeService, priceFor, serviceLabelFor, toNumber, type NormalizedService } from "@/lib/pricing";

type Range = "7d" | "30d" | "90d";
type BizRow = { id: string };

type ApptRow = {
  id: number;
  business_id: string;
  start_ts: string | null;
  status: string | null;
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  price_usd: number | string | null;
  service_id: number | null;
};

type ServiceRow = {
  id: number;
  name: string;
  code: string | null;
  default_price_usd: number | string | null;
  active: boolean | null;
};

// canonicalize labels (match Overview)
const canon = (s: string | null | undefined) =>
  (s ?? "").normalize("NFKD").replace(/\s+/g, " ").replace(/[^\w\s/+.-]/g, "").trim().toLowerCase();

export default function ServicesAnalyticsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [range, setRange] = useState<Range>("30d");
  const [biz, setBiz] = useState<BizRow | null>(null);
  const [rows, setRows] = useState<ApptRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);

  function daysFor(r: Range) { return r === "7d" ? 7 : r === "30d" ? 30 : 90; }

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("business_id").maybeSingle();
      if (prof?.business_id) setBiz({ id: prof.business_id });
    })();
  }, [supabase]);

  async function load() {
    if (!biz?.id) return;

    const days = daysFor(range);
    const end = new Date(); end.setHours(23,59,59,999);
    const start = new Date(end); start.setDate(end.getDate() - (days - 1)); start.setHours(0,0,0,0);

    const [{ data: appts }, { data: svcs }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id,business_id,start_ts,status,service_raw,normalized_service,price_usd,service_id")
        .eq("business_id", biz.id)
        // Exclude Inquiry; only real time-windowed appts
        .gte("start_ts", start.toISOString())
        .lte("start_ts", end.toISOString())
        .not("status", "ilike", "inquiry%")
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [biz?.id, range]);

  const svcMap = useMemo(() => {
    const m = new Map<number, ServiceRow>();
    services.forEach(s => m.set(s.id, s));
    return m;
  }, [services]);

  const svcCanonToLabel = useMemo(() => {
    const m = new Map<string, string>();
    services.forEach(s => {
      const display = s.name || s.code || "Service";
      m.set(canon(display), display);
    });
    return m;
  }, [services]);

  function canonKeyForAppt(r: ApptRow): string {
    if (r.service_id != null && svcMap.has(r.service_id)) {
      const s = svcMap.get(r.service_id)!;
      return canon(s.name || s.code || "Service");
    }
    const ns = r.normalized_service ?? normalizeService(r.service_raw);
    const guessLabel = serviceLabelFor(ns, r.service_raw) || r.service_raw || "";
    const key = canon(guessLabel);
    return svcCanonToLabel.has(key) ? key : "unassigned";
  }

  const groups = useMemo(() => {
    type Bucket = { key: string; label: string; bookings: number; revenue: number };
    const m = new Map<string, Bucket>();

    // seed ALL known services
    svcCanonToLabel.forEach((label, key) => {
      m.set(key, { key, label, bookings: 0, revenue: 0 });
    });

    for (const r of rows) {
      const status = (r.status ?? "").trim().toLowerCase();
      if (status === "inquiry") continue; // safety

      const key = canonKeyForAppt(r);
      if (key === "unassigned") continue; // ignore casing-only mismatches

      if (!m.has(key)) {
        m.set(key, { key, label: svcCanonToLabel.get(key) || "Service", bookings: 0, revenue: 0 });
      }

      const b = m.get(key)!;
      b.bookings += 1;

      if (status !== "cancelled") {
        const explicit = toNumber(r.price_usd, NaN);
        if (Number.isFinite(explicit) && explicit > 0) {
          b.revenue += explicit;
        } else if (r.service_id != null && svcMap.has(r.service_id)) {
          b.revenue += toNumber(svcMap.get(r.service_id)!.default_price_usd, 0);
        } else {
          const ns = r.normalized_service ?? normalizeService(r.service_raw);
          b.revenue += priceFor(ns, 0);
        }
      }
    }

    return Array.from(m.values());
  }, [rows, svcMap, svcCanonToLabel]);

  const totalBookings = groups.reduce((a, b) => a + b.bookings, 0);
  const totalRevenue  = groups.reduce((a, b) => a + b.revenue, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Top Service" value={groups.slice().sort((a,b)=>b.bookings-a.bookings)[0]?.label ?? "-"} />
        <StatCard title="Total Bookings" value={totalBookings} />
        <StatCard title="Revenue (excl. Cancelled)" value={fmtUSD(totalRevenue)} />
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Bookings by service (last {range})</h3>
          <RangePills value={range} onChange={setRange} />
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={groups}>
              <CartesianGrid vertical={false} stroke="#1a1a1a" />
              {/* Hide X ticks; use tooltip for labels */}
              <XAxis dataKey="label" hide tick={false} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} />
              <Tooltip formatter={(v: any, n: string) => n === "bookings" ? [`Bookings: ${v}`, ""] : [fmtUSD(Number(v)), ""]} />
              <Bar dataKey="bookings" fill="#ffffff" radius={[8,8,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

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
                <tr key={g.key} className="border-t border-cx-border">
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
