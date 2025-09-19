'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { createBrowserClient } from '@/lib/supabaseBrowser';
import { fmtUSD, priceFor, serviceLabelFor, toNumber, NormalizedService } from '@/lib/pricing';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

type Row = {
  id: number;
  business_id: string;
  booking_id: string | null;
  status: 'Booked' | 'Rescheduled' | 'Cancelled' | 'Inquiry';
  source: string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  start_ts: string; // timestamptz
  end_ts: string | null;
  received_date: string | null;
  price_usd: string | number | null;
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[#9aa2ad]">Loading…</div>}>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      // 1) scope by user's business
      const { data: profile } = await supabase
        .from('profiles')
        .select('business_id')
        .maybeSingle();

      if (!profile?.business_id) {
        setRows([]);
        setLoading(false);
        return;
      }

      // 2) pull ~90 days (enough for both charts + KPIs)
      const since = new Date();
      since.setDate(since.getDate() - 90);

      const { data, error } = await supabase
        .from('appointments')
        .select(
          'id,business_id,booking_id,status,source,caller_name,caller_phone_e164,service_raw,normalized_service,start_ts,end_ts,received_date,price_usd'
        )
        .eq('business_id', profile.business_id)
        .gte('start_ts', since.toISOString())
        .order('start_ts', { ascending: false })
        .limit(5000);

      if (!cancelled) {
        if (error) console.error(error);
        setRows((data ?? []) as Row[]);
        setLoading(false);
      }
    })();

    // 3) realtime so new bookings appear without refresh
    const ch = supabase
      .channel('rt:dashboard_appointments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          const nextRow = (payload.new ?? payload.old) as Row;
          setRows((cur) => {
            const i = cur.findIndex((r) => r.id === nextRow.id);
            const copy = [...cur];
            if (payload.eventType === 'DELETE') {
              if (i >= 0) copy.splice(i, 1);
              return copy;
            }
            if (i >= 0) {
              copy[i] = nextRow;
              return copy.sort((a, b) => +new Date(b.start_ts) - +new Date(a.start_ts));
            }
            copy.unshift(nextRow);
            return copy.sort((a, b) => +new Date(b.start_ts) - +new Date(a.start_ts));
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [supabase]);

  // ----- KPIs (last 30d) -----
  const now = new Date();
  const days30 = new Date();
  days30.setDate(now.getDate() - 30);

  const last30 = rows.filter((r) => {
    const d = new Date(r.start_ts);
    return d >= days30 && d <= now;
  });

  const bookings30 = last30.length;
  const cancelled30 = last30.filter((r) => r.status === 'Cancelled').length;
  const rescheduled30 = last30.filter((r) => r.status === 'Rescheduled').length;
  const revenue30 = last30
    .filter((r) => r.status !== 'Cancelled')
    .reduce((sum, r) => sum + priceFor(r.normalized_service, toNumber(r.price_usd)), 0);

  // ----- Chart #1: Bookings per day (last 30d) -----
  const bookingsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - (29 - i));
      const key = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
      map.set(key, 0);
    }
    last30.forEach((r) => {
      const d = new Date(r.start_ts);
      const key = d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
      if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, bookings]) => ({ name, bookings }));
  }, [last30, now]);

  // ----- Chart #2: Revenue by service (last 30d, excl Cancelled) -----
  const revenueByService = useMemo(() => {
    const m = new Map<string, number>();
    last30
      .filter((r) => r.status !== 'Cancelled')
      .forEach((r) => {
        const label = serviceLabelFor(r.normalized_service, r.service_raw);
        const amt = priceFor(r.normalized_service, toNumber(r.price_usd));
        m.set(label, (m.get(label) ?? 0) + amt);
      });
    const arr = Array.from(m.entries()).map(([name, revenue]) => ({ name, revenue }));
    // sort desc
    arr.sort((a, b) => b.revenue - a.revenue);
    return arr;
  }, [last30]);

  // ----- Recent Appointments (latest 8 rows) -----
  const recent = rows.slice(0, 8);

  function prettyPhone(e164?: string | null) {
    if (!e164) return '—';
    const m = e164.replace(/[^\d]/g, '').match(/^1?(\d{3})(\d{3})(\d{4})$/);
    if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
    return e164;
  }
  function fmtDate(ts: string) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function fmtTime(ts: string) {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Top KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard label="Bookings (30d)" value={bookings30.toString()} />
        <KpiCard label="Revenue (30d)" value={fmtUSD(revenue30)} />
        <KpiCard label="Rescheduled (30d)" value={rescheduled30.toString()} />
        <KpiCard label="Cancelled (30d)" value={cancelled30.toString()} />
      </div>

      {/* Two Graphs */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Graph A: Bookings by day */}
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-sm p-5">
          <div className="mb-3 text-sm text-[#9aa2ad]">Bookings per day (last 30 days)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bookingsByDay} margin={{ top: 10, right: 18, bottom: 2, left: 0 }}>
                <CartesianGrid stroke="#22262e" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#9aa2ad', fontSize: 12 }}
                  axisLine={{ stroke: '#22262e' }}
                  tickLine={{ stroke: '#22262e' }}
                  interval={3}
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

        {/* Graph B: Revenue by service */}
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-sm p-5">
          <div className="mb-3 text-sm text-[#9aa2ad]">Revenue by service (last 30 days)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueByService} margin={{ top: 10, right: 18, bottom: 2, left: 0 }}>
                <CartesianGrid stroke="#22262e" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#9aa2ad', fontSize: 12 }}
                  axisLine={{ stroke: '#22262e' }}
                  tickLine={{ stroke: '#22262e' }}
                  interval={0}
                  height={56}
                />
                <YAxis
                  tick={{ fill: '#9aa2ad', fontSize: 12 }}
                  axisLine={{ stroke: '#22262e' }}
                  tickLine={{ stroke: '#22262e' }}
                />
                <Tooltip
                  formatter={(v: any) => fmtUSD(Number(v) || 0)}
                  contentStyle={{
                    background: '#0f1115',
                    border: '1px solid #22262e',
                    borderRadius: '12px',
                    color: '#dcdfe6',
                  }}
                />
                <Line type="monotone" dataKey="revenue" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Appointments */}
      <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#22262e] text-[#9aa2ad] text-sm">
          Recent appointments
        </div>
        <table className="w-full text-sm">
          <thead className="bg-[#0a0a0b] text-[#9aa2ad]">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Time</th>
              <th className="text-left px-4 py-3">Service</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Price</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-6 text-[#9aa2ad]" colSpan={7}>
                  Loading…
                </td>
              </tr>
            ) : recent.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-[#9aa2ad]" colSpan={7}>
                  No recent appointments.
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

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] shadow-sm p-5">
      <div className="text-sm text-[#9aa2ad]">{label}</div>
      <div className="mt-2 text-xl text-[#dcdfe6]">{value}</div>
    </div>
  );
}
