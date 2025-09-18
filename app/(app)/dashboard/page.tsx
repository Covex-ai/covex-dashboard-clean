'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabaseBrowser';
import { priceFor, fmtUSD } from '@/lib/pricing';
import StatusBadge, { ApptStatus } from '@/components/StatusBadge';
import { When } from '@/components/When';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid,
} from 'recharts';

type Row = {
  id: number;
  business_id: string;
  booking_id: string;
  status: ApptStatus | string;
  source: string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_raw: string | null;
  normalized_service: 'ACUTE_30' | 'STANDARD_45' | 'NEWPATIENT_60' | null;
  start_ts: string;
  end_ts: string | null;
  price_usd: string | number | null; // numeric -> string
  created_at?: string | null;
  updated_at?: string | null;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
// <<< NEW: numeric coercion helper
function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function Inner() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const params = useSearchParams();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [biz, setBiz] = useState<string | null>(null);

  useEffect(() => {
    const bizParam = params.get('biz');
    if (bizParam) {
      setBiz(bizParam);
      return;
    }

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) {
        setBiz(null);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('business_id')
        .eq('id', uid)
        .maybeSingle();
      setBiz((data?.business_id as string) ?? null);
    })();
  }, [params, supabase]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const from = new Date(Date.now() - 30 * 864e5).toISOString();

      let query = supabase
        .from('appointments')
        .select(
          'id,business_id,booking_id,status,source,caller_name,caller_phone_e164,service_raw,normalized_service,start_ts,end_ts,price_usd,created_at,updated_at'
        )
        .gte('start_ts', from)
        .order('start_ts', { ascending: true });

      if (biz) query = query.eq('business_id', biz);

      const { data, error } = await query;
      if (!error && data) setRows(data as Row[]);
      setLoading(false);
    })();
  }, [supabase, biz]);

  // KPIs
  const now = Date.now();
  const upcoming = rows.filter(r => new Date(r.start_ts).getTime() >= now && r.status !== 'Cancelled').length;
  const booked30 = rows.filter(r => r.status === 'Booked' || r.status === 'Rescheduled').length;
  const revenue30 = rows
    .filter(r => r.status !== 'Cancelled')
    .reduce((sum, r) => sum + priceFor(r.normalized_service, toNumber(r.price_usd)), 0); // <<< FIX

  // Chart #1: bookings per day (last 30d)
  const byDay = (() => {
    const map = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5);
      const key = d.toISOString().slice(0, 10);
      map.set(key, 0);
    }
    rows.forEach(r => {
      const key = new Date(r.start_ts).toISOString().slice(0, 10);
      if (map.has(key) && r.status !== 'Cancelled') {
        map.set(key, (map.get(key) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([key, cnt]) => ({
      day: new Date(key).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
      bookings: cnt,
    }));
  })();

  // Chart #2: revenue by service (last 30d, excluding cancelled)
  const serviceRevenue = (() => {
    const svc = new Map<string, number>();
    rows.forEach(r => {
      if (r.status === 'Cancelled') return;
      const price = priceFor(r.normalized_service, toNumber(r.price_usd)); // <<< FIX
      const key = r.normalized_service || 'Other';
      svc.set(key, (svc.get(key) || 0) + price);
    });
    return Array.from(svc.entries()).map(([service, revenue]) => ({ service, revenue }));
  })();

  // Recent items (for table and feed)
  const recent = [...rows].sort(
    (a, b) =>
      new Date(b.start_ts).getTime() - new Date(a.start_ts).getTime()
  ).slice(0, 6);

  const recentChanges = [...rows]
    .sort((a, b) =>
      new Date(b.updated_at || b.created_at || b.start_ts).getTime()
      - new Date(a.updated_at || a.created_at || a.start_ts).getTime()
    )
    .slice(0, 10);

  return (
    <div className="p-6 space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#9aa2ad] text-sm">Upcoming</div>
          <div className="text-[#dcdfe6] text-3xl mt-2">{upcoming}</div>
        </div>
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#9aa2ad] text-sm">Booked (30d)</div>
          <div className="text-[#dcdfe6] text-3xl mt-2">{booked30}</div>
        </div>
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#9aa2ad] text-sm">Revenue (30d)</div>
          <div className="text-[#dcdfe6] text-3xl mt-2">{fmtUSD(revenue30)}</div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#dcdfe6] mb-3">Bookings (last 30 days)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={byDay} margin={{ left: 8, right: 8 }}>
                <CartesianGrid stroke="#22262e" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: '#9aa2ad', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#9aa2ad', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#0f1115', border: '1px solid #22262e', color: '#dcdfe6' }} />
                <Area type="monotone" dataKey="bookings" fill="#3b82f6" stroke="#3b82f6" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
          <div className="text-[#dcdfe6] mb-3">Revenue by service (30d)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serviceRevenue} margin={{ left: 8, right: 8 }}>
                <CartesianGrid stroke="#22262e" strokeDasharray="3 3" />
                <XAxis dataKey="service" tick={{ fill: '#9aa2ad', fontSize: 12 }} />
                <YAxis tickFormatter={(v)=>fmtUSD(v)} tick={{ fill: '#9aa2ad', fontSize: 12 }} />
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

      {/* Recent Changes feed */}
      <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
        <div className="text-[#dcdfe6] mb-3">Recent Changes</div>
        {recentChanges.length === 0 ? (
          <div className="text-[#9aa2ad] text-sm">No recent changes.</div>
        ) : (
          <ul className="space-y-2">
            {recentChanges.map((r) => (
              <li key={r.id} className="text-sm text-[#dcdfe6] flex items-center">
                <StatusBadge status={r.status as ApptStatus} />
                <span className="ml-3">{r.caller_name || 'Unknown'}</span>
                <span className="ml-2 text-[#9aa2ad]">· {r.normalized_service || r.service_raw || '-'}</span>
                <When ts={r.updated_at || r.created_at} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent Appointments table */}
      <div className="rounded-2xl bg-[#0f1115] border border-[#22262e] p-5">
        <div className="text-[#dcdfe6] mb-3">Recent Appointments</div>
        <div className="rounded-2xl overflow-hidden border border-[#22262e]">
          <table className="w-full text-sm">
            <thead className="text-[#9aa2ad] bg-[#0f1115]">
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
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[#9aa2ad]">Loading…</td></tr>
              ) : recent.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[#9aa2ad]">No recent appointments</td></tr>
              ) : (
                recent.map((r) => {
                  const price = priceFor(r.normalized_service, toNumber(r.price_usd)); // <<< FIX
                  return (
                    <tr key={r.id} className="border-t border-[#22262e]">
                      <td className="px-4 py-3 text-[#dcdfe6]">{fmtDate(r.start_ts)}</td>
                      <td className="px-4 py-3 text-[#dcdfe6]">
                        {fmtTime(r.start_ts)}
                        <When ts={r.updated_at} />
                      </td>
                      <td className="px-4 py-3 text-[#dcdfe6]">{r.normalized_service || r.service_raw || '-'}</td>
                      <td className="px-4 py-3 text-[#dcdfe6]">{r.caller_name || '-'}</td>
                      <td className="px-4 py-3 text-[#dcdfe6]">{r.caller_phone_e164 || '-'}</td>
                      <td className="px-4 py-3 text-[#dcdfe6]">{r.source || 'Retell'}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status as ApptStatus} /></td>
                      <td className="px-4 py-3 text-right text-[#dcdfe6]">{fmtUSD(price)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-[#9aa2ad] mt-2">
          Rescheduled show in <span className="text-[#f5c451]">gold</span>, cancelled rows are dimmed on the Appointments page.
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-[#9aa2ad]">Loading…</div>}>
      <Inner />
    </Suspense>
  );
}
