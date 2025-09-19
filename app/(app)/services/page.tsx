'use client';

import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { createBrowserClient } from '@/lib/supabaseBrowser';
import { priceFor, fmtUSD, serviceLabelFor, toNumber } from '@/lib/pricing';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

type Row = {
  id: number;
  business_id: string;
  normalized_service: string | null;
  service_raw: string | null;
  status: 'Booked' | 'Rescheduled' | 'Cancelled' | 'Inquiry';
  start_ts: string; // timestamptz
  price_usd: string | number | null;
  source: string | null;
};

const RANGE_OPTS = [
  { key: 7 as const, label: '7 days' },
  { key: 30 as const, label: '30 days' },
  { key: 90 as const, label: '90 days' },
];

export default function ServicesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[#9aa2ad]">Loading…</div>}>
      <ServicesInner />
    </Suspense>
  );
}

function ServicesInner() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [range, setRange] = useState<(typeof RANGE_OPTS)[number]['key']>(30);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Compute range window
  const { fromISO, toISO } = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - range + 1);
    return { fromISO: from.toISOString(), toISO: to.toISOString() };
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // pull the user's business id from profiles (mock-safe)
      const { data: profile } = await supabase
        .from('profiles')
        .select('business_id')
        .maybeSingle();

      // if no business_id, nothing to show
      if (!profile?.business_id) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('appointments')
        .select(
          'id,business_id,normalized_service,service_raw,status,start_ts,price_usd,source'
        )
        .eq('business_id', profile.business_id)
        .gte('start_ts', fromISO)
        .lte('start_ts', toISO)
        .order('start_ts', { ascending: false });

      if (!cancelled) {
        if (error) {
          console.error(error);
          setRows([]);
        } else {
          setRows((data ?? []) as Row[]);
        }
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, fromISO, toISO]);

  // Aggregate by service (skip Cancelled for revenue & counts)
  const agg = useMemo(() => {
    const m = new Map<
      string,
      { label: string; bookings: number; revenue: number }
    >();
    (rows ?? []).forEach((r) => {
      if (r.status === 'Cancelled') return;
      const key = r.normalized_service ?? (r.service_raw ?? 'Other');
      const label = serviceLabelFor(r.normalized_service, r.service_raw);
      const entry = m.get(key) ?? { label, bookings: 0, revenue: 0 };
      entry.bookings += 1;
      entry.revenue += priceFor(r.normalized_service, toNumber(r.price_usd));
      m.set(key, entry);
    });
    // Sort by revenue desc
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
  }, [rows]);

  const topService = agg[0];

  return (
    <div className="p-6 text-[#dcdfe6]">
      {/* Header + Range */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Services</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[#9aa2ad]">Range</label>
          <div className="rounded-xl bg-[#0f1115] border border-[#22262e]">
            <select
              className="bg-transparent px-3 py-1.5 text-sm outline-none"
              value={range}
              onChange={(e) => setRange(Number(e.target.value) as any)}
            >
              {RANGE_OPTS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Highlight card */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-sm p-5">
          <div className="text-sm text-[#9aa2ad]">Top Service</div>
          <div className="mt-2 text-base">
            {topService ? topService.label : '—'}
          </div>
          <div className="mt-1 text-sm text-[#9aa2ad]">
            {topService
              ? `${topService.bookings} bookings • ${fmtUSD(topService.revenue)}`
              : 'No data in range'}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-sm p-5">
          <div className="text-sm text-[#9aa2ad]">Total Bookings</div>
          <div className="mt-2 text-base">
            {agg.reduce((s, a) => s + a.bookings, 0)}
          </div>
        </div>
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-sm p-5">
          <div className="text-sm text-[#9aa2ad]">Revenue (excl. Cancelled)</div>
          <div className="mt-2 text-base">
            {fmtUSD(agg.reduce((s, a) => s + a.revenue, 0))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-sm p-5 mb-6">
        <div className="mb-3 text-sm text-[#9aa2ad]">
          Bookings by service (last {range}d)
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={agg.map((a) => ({ name: a.label, bookings: a.bookings }))}
              margin={{ top: 10, right: 18, bottom: 4, left: 0 }}
            >
              <CartesianGrid stroke="#22262e" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: '#9aa2ad', fontSize: 12 }}
                axisLine={{ stroke: '#22262e' }}
                tickLine={{ stroke: '#22262e' }}
                interval={0}
                height={48}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#9aa2ad', fontSize: 12 }}
                axisLine={{ stroke: '#22262e' }}
                tickLine={{ stroke: '#22262e' }}
              />
              <Tooltip
                contentStyle={{
                  background: '#0f1115',
                  border: '1px solid #22262e',
                  borderRadius: '12px',
                  color: '#dcdfe6',
                }}
              />
              <Bar dataKey="bookings" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0f1115] text-[#9aa2ad] border-b border-[#22262e]">
            <tr>
              <th className="text-left px-4 py-3">Service</th>
              <th className="text-left px-4 py-3">Bookings</th>
              <th className="text-left px-4 py-3">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-4 text-[#9aa2ad]" colSpan={3}>
                  Loading…
                </td>
              </tr>
            ) : agg.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-[#9aa2ad]" colSpan={3}>
                  No data in this range.
                </td>
              </tr>
            ) : (
              agg.map((a) => (
                <tr key={a.label} className="border-t border-[#22262e]">
                  <td className="px-4 py-3 text-[#dcdfe6]">{a.label}</td>
                  <td className="px-4 py-3 text-[#dcdfe6]">{a.bookings}</td>
                  <td className="px-4 py-3 text-[#dcdfe6]">
                    {fmtUSD(a.revenue)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
