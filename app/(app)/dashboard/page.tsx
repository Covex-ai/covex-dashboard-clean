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
  business_id: string;
  booking_id: string | null;
  status: 'Booked' | 'Rescheduled' | 'Cancelled' | 'Inquiry';
  source: string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_raw: string | null;
  normalized_service: NormalizedService;
  start_ts: string; // timestamptz
  end_ts: string | null;
  received_date: string | null;
  price_usd: string | number | null;
};

function fmtDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
}
function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function prettyPhone(e164?: string | null) {
  if (!e164) return '—';
  const m = e164.match(/^\+?1?(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let canceled = false;

    async function load() {
      setLoading(true);
      // grab last ~120 days for charts + table
      const since = new Date();
      since.setDate(since.getDate() - 120);

      const { data, error } = await supabase
        .from('appointments')
        .select(
          'id,business_id,booking_id,status,source,caller_name,caller_phone_e164,service_raw,normalized_service,start_ts,end_ts,received_date,price_usd'
        )
        .gte('start_ts', since.toISOString())
        .order('start_ts', { ascending: false })
        .limit(1200);

      if (!canceled) {
        if (error) console.error(error);
        setRows((data ?? []) as Row[]);
        setLoading(false);
      }
    }

    load();

    // realtime
    const ch = supabase
      .channel('rt:dashboard')
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

  // KPIs
  const now = new Date();
  const upcoming = rows.filter(
    (r) => new Date(r.start_ts) > now && r.status !== 'Cancelled'
  ).length;

  const booked30 = rows.filter((r) => {
    const dt = new Date(r.start_ts);
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return r.status !== 'Cancelled' && dt >= from && dt <= now;
  }).length;

  const revenue30 = rows
    .filter((r) => {
      const dt = new Date(r.start_ts);
      const from = new Date();
      from.setDate(from.getDate() - 30);
      return r.status !== 'Cancelled' && dt >= from && dt <= now;
    })
    .reduce((sum, r) => sum + priceFor(r.normalized_service, toNumber(r.price_usd)), 0);

  // Chart #1: bookings / day for last 30 days
  const byDay = (() => {
    const map = new Map<string, number>();
    const from = new Date();
    from.setDate(from.getDate() - 29); // include today (30 points total)
    for (let i = 0; i < 30; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      map.set(key, 0);
    }
    rows.forEach((r) => {
      const d = new Date(r.start_ts);
      const key = d.toISOString().slice(0, 10);
      if (map.has(key) && r.status !== 'Cancelled') {
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  })();
  const maxBookings = Math.max(1, ...byDay.map((d) => d.count));

  // Chart #2: revenue by service (30d)
  const byService = (() => {
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const dt = new Date(r.start_ts);
      if (r.status === 'Cancelled' || dt < from) return;
      const label = serviceLabelFor(r.normalized_service, r.service_raw);
      const n = priceFor(r.normalized_service, toNumber(r.price_usd));
      m.set(label, (m.get(label) ?? 0) + n);
    });
    return Array.from(m.entries())
      .map(([label, revenue]) => ({ label, revenue }))
      .sort((a, b) => b.revenue - a.revenue);
  })();
  const maxRevenue = Math.max(1, ...byService.map((s) => s.revenue));

  const recent = rows.slice(0, 8);

  return (
    <div className="p-6 space-y-6">
      {/* KPI cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] p-4 shadow-lg">
          <div className="text-sm text-[#9aa2ad]">Upcoming</div>
          <div className="text-3xl text-[#dcdfe6] font-semibold mt-1">{upcoming}</div>
        </div>
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] p-4 shadow-lg">
          <div className="text-sm text-[#9aa2ad]">Booked (30d)</div>
          <div className="text-3xl text-[#dcdfe6] font-semibold mt-1">{booked30}</div>
        </div>
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] p-4 shadow-lg">
          <div className="text-sm text-[#9aa2ad]">Revenue (30d)</div>
          <div className="text-3xl text-[#dcdfe6] font-semibold mt-1">{fmtUSD(revenue30)}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Bookings per day */}
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] p-4 shadow-lg">
          <div className="text-[#dcdfe6] font-medium mb-3">Bookings per day (last 30 days)</div>
          <div className="h-32 flex items-end gap-[6px]">
            {byDay.map((d) => {
              const h = (d.count / maxBookings) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full rounded-t bg-[#3b82f6]"
                    style={{ height: `${Math.max(6, h)}%` }}
                    title={`${d.date}: ${d.count}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-[#9aa2ad]">Counts exclude cancelled.</div>
        </div>

        {/* Revenue by service */}
        <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] p-4 shadow-lg">
          <div className="text-[#dcdfe6] font-medium mb-3">Revenue by service (30 days)</div>
          <div className="space-y-2">
            {byService.length === 0 ? (
              <div className="text-[#9aa2ad] text-sm">No revenue in the last 30 days.</div>
            ) : (
              byService.map((s) => {
                const w = (s.revenue / maxRevenue) * 100;
                return (
                  <div key={s.label}>
                    <div className="flex justify-between text-xs text-[#9aa2ad] mb-1">
                      <span className="truncate pr-2">{s.label}</span>
                      <span>{fmtUSD(s.revenue)}</span>
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
      </div>

      {/* Recent appointments */}
      <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] shadow-lg overflow-hidden">
        <div className="p-4 text-[#dcdfe6] font-medium">Recent Appointments</div>
        <table className="w-full text-sm">
          <thead className="bg-[#0a0a0b] text-[#9aa2ad]">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Time</th>
              <th className="text-left px-4 py-3">Service</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Price</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-[#9aa2ad]" colSpan={8}>
                  Loading…
                </td>
              </tr>
            ) : recent.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-[#9aa2ad]" colSpan={8}>
                  No appointments yet.
                </td>
              </tr>
            ) : (
              recent.map((r) => {
                const price = priceFor(r.normalized_service, toNumber(r.price_usd));
                const label = serviceLabelFor(r.normalized_service, r.service_raw);
                const statusClasses =
                  r.status === 'Cancelled'
                    ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                    : r.status === 'Rescheduled'
                    ? 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30'
                    : r.status === 'Inquiry'
                    ? 'bg-slate-500/15 text-slate-300 border border-slate-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';

                return (
                  <tr key={r.id} className="border-t border-[#22262e]">
                    <td className="px-4 py-3 text-[#dcdfe6]">{fmtDate(r.start_ts)}</td>
                    <td className="px-4 py-3 text-[#dcdfe6]">{fmtTime(r.start_ts)}</td>
                    <td className="px-4 py-3 text-[#dcdfe6]">{label}</td>
                    <td className="px-4 py-3 text-[#dcdfe6]">{r.caller_name ?? '—'}</td>
                    <td className="px-4 py-3 text-[#dcdfe6]">{prettyPhone(r.caller_phone_e164)}</td>
                    <td className="px-4 py-3 text-[#9aa2ad]">{r.source ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-xl ${statusClasses}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-[#dcdfe6]">{fmtUSD(price)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
