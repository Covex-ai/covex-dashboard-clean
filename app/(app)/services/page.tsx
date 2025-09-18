'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { createBrowserClient } from '@/lib/supabaseBrowser';
import { priceFor, fmtUSD, SERVICE_PRICE_USD } from '@/lib/pricing';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

type Row = {
  id: number;
  business_id: string;
  status: 'Booked' | 'Rescheduled' | 'Cancelled' | 'Inquiry';
  normalized_service: string | null;
  service_raw: string | null;
  start_ts: string;
  price_usd: number | null;
};

const ranges = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

function ServicesInner() {
  const supabase = createBrowserClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [range, setRange] = useState(ranges[1]);
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
      since.setDate(since.getDate() - range.days);

      const { data } = await supabase
        .from('appointments')
        .select('id,business_id,status,normalized_service,service_raw,start_ts,price_usd')
        .eq('business_id', biz)
        .gte('start_ts', since.toISOString())
        .order('start_ts', { ascending: true });

      setRows(data ?? []);
      setLoading(false);
    })();
  }, [supabase, range]);

  // Aggregate by normalized_service, excluding Cancelled
  const groups = useMemo(() => {
    const m = new Map<string, { service: string; bookings: number; revenue: number }>();
    for (const r of rows) {
      if (r.status === 'Cancelled') continue;
      const key = r.normalized_service ?? r.service_raw ?? 'Unknown';
      const price = priceFor(r.normalized_service, r.price_usd) ?? 0;
      if (!m.has(key)) m.set(key, { service: key, bookings: 0, revenue: 0 });
      const g = m.get(key)!;
      g.bookings += 1;
      g.revenue += price;
    }
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  const top = groups[0];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-[#dcdfe6] text-xl">Services</div>
        <select
          value={range.days}
          onChange={(e) => setRange(ranges.find((r) => r.days === Number(e.target.value)) || ranges[1])}
          className="bg-[#0f1115] border border-[#22262e] text-[#dcdfe6] rounded-xl px-3 py-2"
        >
          {ranges.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#9aa2ad] text-sm">Top revenue service</div>
          <div className="text-[#dcdfe6] text-2xl mt-1">{top?.service ?? '-'}</div>
          <div className="text-[#9aa2ad] mt-1">Revenue: {fmtUSD(top?.revenue ?? 0)}</div>
        </div>
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#9aa2ad] text-sm">Total revenue</div>
          <div className="text-[#dcdfe6] text-2xl mt-1">
            {fmtUSD(groups.reduce((a, g) => a + g.revenue, 0))}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#9aa2ad] text-sm">Total bookings</div>
          <div className="text-[#dcdfe6] text-2xl mt-1">
            {groups.reduce((a, g) => a + g.bookings, 0)}
          </div>
        </div>
      </div>

      {/* Revenue by Service chart */}
      <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-4">
        <div className="text-[#dcdfe6] mb-2">Revenue by service</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={groups}>
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

      {/* Table */}
      <div className="rounded-2xl shadow-lg bg-[#0f1115] border border-[#22262e] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[#9aa2ad] bg-[#0a0a0b]">
            <tr>
              <th className="text-left px-4 py-3">Service</th>
              <th className="text-left px-4 py-3">Bookings</th>
              <th className="text-left px-4 py-3">Revenue</th>
            </tr>
          </thead>
          <tbody className="text-[#dcdfe6]">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-[#9aa2ad]">
                  Loading…
                </td>
              </tr>
            ) : groups.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-[#9aa2ad]">
                  No data.
                </td>
              </tr>
            ) : (
              groups.map((g) => (
                <tr key={g.service} className="border-t border-[#22262e]/60">
                  <td className="px-4 py-3">{g.service}</td>
                  <td className="px-4 py-3">{g.bookings}</td>
                  <td className="px-4 py-3">{fmtUSD(g.revenue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-[#9aa2ad]">Loading…</div>}>
      <ServicesInner />
    </Suspense>
  );
}
