'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@/lib/supabaseBrowser';
import { priceFor, fmtUSD, SERVICE_PRICE_USD } from '@/lib/pricing';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';

type Row = {
  id: number;
  business_id: string;
  status: 'Booked' | 'Rescheduled' | 'Cancelled' | 'Inquiry';
  normalized_service: string | null;
  service_raw: string | null;
  start_ts: string; // ISO
  price_usd: number | null;
};

function DashboardInner() {
  const supabase = createBrowserClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        setRows([]);
        setLoading(false);
        return;
      }
      const { data: prof } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', uid)
        .maybeSingle();
      const biz = prof?.business_id;
      if (!biz) {
        setRows([]);
        setLoading(false);
        return;
      }

      const since = new Date();
      since.setDate(since.getDate() - 30);

      const { data } = await supabase
        .from('appointments')
        .select('id,business_id,status,normalized_service,service_raw,start_ts,price_usd')
        .eq('business_id', biz)
        .gte('start_ts', since.toISOString())
        .order('start_ts', { ascending: true });

      setRows(data ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  const enriched = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        derived_price: priceFor(r.normalized_service, r.price_usd),
        service_label: r.normalized_service ?? r.service_raw ?? 'Unknown',
        date_key: new Date(r.start_ts).toLocaleDateString(),
      })),
    [rows]
  );

  // KPIs
  const upcoming = enriched.filter((r) => new Date(r.start_ts) > new Date() && r.status !== 'Cancelled').length;
  const booked30 = enriched.filter((r) => r.status === 'Booked').length;
  const revenue30 =
    enriched
      .filter((r) => r.status !== 'Cancelled')
      .reduce((acc, r) => acc + (r.derived_price ?? 0), 0) || 0;

  // Chart 1: bookings per day (last 30d)
  const bookingsPerDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of enriched) {
      const k = r.date_key;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([date, count]) => ({ date, count }));
  }, [enriched]);

  // Chart 2: revenue by service (last 30d)
  const revenueByService = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of enriched) {
      if (r.status === 'Cancelled') continue;
      const s = r.service_label;
      m.set(s, (m.get(s) ?? 0) + (r.derived_price ?? 0));
    }
    return Array.from(m.entries()).map(([service, revenue]) => ({ service, revenue }));
  }, [enriched]);

  return (
    <div className="p-6 space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#9aa2ad] text-sm">Upcoming</div>
          <div className="text-3xl font-semibold text-[#dcdfe6] mt-1">{upcoming}</div>
        </div>
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#9aa2ad] text-sm">Booked (30d)</div>
          <div className="text-3xl font-semibold text-[#dcdfe6] mt-1">{booked30}</div>
        </div>
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#9aa2ad] text-sm">Revenue (30d)</div>
          <div className="text-3xl font-semibold text-[#dcdfe6] mt-1">{fmtUSD(revenue30)}</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-4">
          <div className="text-[#dcdfe6] mb-2">Bookings (last 30 days)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bookingsPerDay}>
                <CartesianGrid stroke="#22262e" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#9aa2ad" />
                <YAxis stroke="#9aa2ad" allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#0f1115', border: '1px solid #22262e', color: '#dcdfe6' }}
                />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-4">
          <div className="text-[#dcdfe6] mb-2">Revenue by service (30 days)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByService}>
                <CartesianGrid stroke="#22262e" strokeDasharray="3 3" />
                <XAxis dataKey="service" stroke="#9aa2ad" />
                <YAxis stroke="#9aa2ad" />
                <Tooltip
                  formatter={(v: number) => fmtUSD(v)}
                  contentStyle={{ background: '#0f1115', border: '1px solid #22262e', color: '#dcdfe6' }}
                />
                <Bar dataKey="revenue" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Appointments table */}
      <div className="rounded-2xl bg-[#0f1115] border border-[#22262e]">
        <div className="px-5 py-4 text-[#dcdfe6]">Recent Appointments</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[#9aa2ad] bg-[#0a0a0b]">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Service</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Price</th>
              </tr>
            </thead>
            <tbody className="text-[#dcdfe6]">
              {(loading ? [] : enriched)
                .slice(-10)
                .reverse()
                .map((r) => (
                  <tr key={r.id} className="border-t border-[#22262e]/60">
                    <td className="px-4 py-3">{new Date(r.start_ts).toLocaleDateString()}</td>
                    <td className="px-4 py-3">{new Date(r.start_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-4 py-3">{r.service_label}</td>
                    <td className="px-4 py-3">{r.status}</td>
                    <td className="px-4 py-3">{fmtUSD(r.derived_price)}</td>
                  </tr>
                ))}
              {(!loading && enriched.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#9aa2ad]">No data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-[#9aa2ad]">Loading…</div>}>
      <DashboardInner />
    </Suspense>
  );
}
