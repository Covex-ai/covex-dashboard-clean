'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@/lib/supabaseBrowser';
import {
  fmtUSD,
  priceFor,
  serviceLabelFor,
  toNumber,
  NormalizedService,
} from '@/lib/pricing';

type Row = {
  id: number;
  status: 'Booked' | 'Rescheduled' | 'Cancelled' | 'Inquiry';
  service_raw: string | null;
  normalized_service: NormalizedService;
  start_ts: string;
  price_usd: string | number | null;
};

type RangeKey = '7' | '30' | '90';

const RANGE_LABELS: Record<RangeKey, string> = {
  '7': '7 days',
  '30': '30 days',
  '90': '90 days',
};

export default function ServicesPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [range, setRange] = useState<RangeKey>('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let canceled = false;

    async function load() {
      setLoading(true);

      const since = new Date();
      since.setDate(since.getDate() - 120); // fetch once; filter client-side

      const { data, error } = await supabase
        .from('appointments')
        .select('id,status,service_raw,normalized_service,start_ts,price_usd')
        .gte('start_ts', since.toISOString())
        .order('start_ts', { ascending: false })
        .limit(2000);

      if (!canceled) {
        if (error) console.error(error);
        setRows((data ?? []) as Row[]);
        setLoading(false);
      }
    }
    load();

    // realtime
    const ch = supabase
      .channel('rt:services')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          setRows((cur) => {
            const next = [...cur];
            const row = (payload.new ?? payload.old) as Row;
            const idx = next.findIndex((r) => r.id === row.id);
            if (payload.eventType === 'DELETE') {
              if (idx >= 0) next.splice(idx, 1);
            } else if (idx >= 0) {
              next[idx] = row;
            } else {
              next.unshift(row);
            }
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      canceled = true;
      supabase.removeChannel(ch);
    };
  }, [supabase]);

  // filter by selected range (exclude cancelled for metrics)
  const filtered = rows.filter((r) => {
    const dt = new Date(r.start_ts);
    const from = new Date();
    from.setDate(from.getDate() - parseInt(range, 10));
    return r.status !== 'Cancelled' && dt >= from;
  });

  // aggregate
  const agg = (() => {
    const m = new Map<
      string,
      { label: string; bookings: number; revenue: number; key: string }
    >();
    filtered.forEach((r) => {
      const key = (r.normalized_service ?? r.service_raw ?? 'Other') as string;
      const label = serviceLabelFor(r.normalized_service, r.service_raw);
      if (!m.has(key)) m.set(key, { label, bookings: 0, revenue: 0, key });
      const ref = m.get(key)!;
      ref.bookings += 1;
      ref.revenue += priceFor(r.normalized_service, toNumber(r.price_usd));
    });
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
  })();

  const topByRevenue = agg[0];
  const topByBookings = [...agg].sort((a, b) => b.bookings - a.bookings)[0];
  const totalRevenue = agg.reduce((s, a) => s + a.revenue, 0);
  const totalBookings = agg.reduce((s, a) => s + a.bookings, 0);

  const maxRevenue = Math.max(1, ...agg.map((a) => a.revenue));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[#dcdfe6] text-2xl font-semibold">Services</h1>

        <div className="inline-flex rounded-xl border border-[#22262e] overflow-hidden">
          {(['7', '30', '90'] as RangeKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={`px-3 py-1.5 text-sm ${
                range === k ? 'bg-[#3b82f6] text-white' : 'text-[#9aa2ad] hover:text-[#dcdfe6]'
              }`}
            >
              {RANGE_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] p-4 shadow-lg">
          <div className="text-sm text-[#9aa2ad]">Total revenue</div>
          <div className="text-2xl text-[#dcdfe6] font-semibold mt-1">{fmtUSD(totalRevenue)}</div>
        </div>
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] p-4 shadow-lg">
          <div className="text-sm text-[#9aa2ad]">Total bookings</div>
          <div className="text-2xl text-[#dcdfe6] font-semibold mt-1">{totalBookings}</div>
        </div>
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] p-4 shadow-lg">
          <div className="text-sm text-[#9aa2ad]">Top by revenue</div>
          <div className="text-sm text-[#dcdfe6] mt-1 truncate">
            {topByRevenue ? `${topByRevenue.label} • ${fmtUSD(topByRevenue.revenue)}` : '—'}
          </div>
        </div>
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] p-4 shadow-lg">
          <div className="text-sm text-[#9aa2ad]">Most booked</div>
          <div className="text-sm text-[#dcdfe6] mt-1 truncate">
            {topByBookings ? `${topByBookings.label} • ${topByBookings.bookings}` : '—'}
          </div>
        </div>
      </div>

      {/* Chart: revenue by service */}
      <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] p-4 shadow-lg">
        <div className="text-[#dcdfe6] font-medium mb-3">Revenue by service ({RANGE_LABELS[range]})</div>
        <div className="space-y-2">
          {agg.length === 0 ? (
            <div className="text-[#9aa2ad] text-sm">No data in this range.</div>
          ) : (
            agg.map((a) => {
              const w = (a.revenue / maxRevenue) * 100;
              return (
                <div key={a.key}>
                  <div className="flex justify-between text-xs text-[#9aa2ad] mb-1">
                    <span className="truncate pr-2">{a.label}</span>
                    <span>
                      {fmtUSD(a.revenue)} • {a.bookings} bookings
                    </span>
                  </div>
                  <div className="h-2 rounded bg-[#14161b] overflow-hidden">
                    <div className="h-full bg-[#3b82f6]" style={{ width: `${w}%` }} />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] shadow-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0a0a0b] text-[#9aa2ad]">
            <tr>
              <th className="text-left px-4 py-3">Service</th>
              <th className="text-left px-4 py-3">Bookings</th>
              <th className="text-right px-4 py-3">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-[#9aa2ad]" colSpan={3}>
                  Loading…
                </td>
              </tr>
            ) : agg.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-[#9aa2ad]" colSpan={3}>
                  No data in this range.
                </td>
              </tr>
            ) : (
              agg.map((a) => (
                <tr key={a.key} className="border-t border-[#22262e]">
                  <td className="px-4 py-3 text-[#dcdfe6]">{a.label}</td>
                  <td className="px-4 py-3 text-[#dcdfe6]">{a.bookings}</td>
                  <td className="px-4 py-3 text-right text-[#dcdfe6]">{fmtUSD(a.revenue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
