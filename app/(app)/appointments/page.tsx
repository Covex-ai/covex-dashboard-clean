'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { createBrowserClient } from '@/lib/supabaseBrowser';
import { priceFor, fmtUSD } from '@/lib/pricing';

type Row = {
  id: number;
  business_id: string;
  booking_id: string | null;
  status: 'Booked' | 'Rescheduled' | 'Cancelled' | 'Inquiry';
  source: string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_raw: string | null;
  normalized_service: string | null;
  start_ts: string; // ISO
  end_ts: string | null;
  price_usd: number | null;
};

const ranges = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'Future', days: 3650 },
];

function prettyPhone(v?: string | null) {
  if (!v) return '-';
  // assume already E.164, just display
  return v.replace('+1', '+1 ').trim();
}

function formatDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString();
}
function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function AppointmentsInner() {
  const supabase = createBrowserClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState(ranges[1]); // default 30 days
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

      let q = supabase
        .from('appointments')
        .select(
          'id,business_id,booking_id,status,source,caller_name,caller_phone_e164,service_raw,normalized_service,start_ts,end_ts,price_usd'
        )
        .eq('business_id', biz)
        .gte('start_ts', since.toISOString())
        .order('start_ts', { ascending: true });

      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(
          `caller_name.ilike.${s},caller_phone_e164.ilike.${s},service_raw.ilike.${s},normalized_service.ilike.${s}`
        );
      }

      const { data } = await q;
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [supabase, range, search]);

  const computed = useMemo(() => {
    return rows.map((r) => ({
      ...r,
      derived_price: priceFor(r.normalized_service, r.price_usd),
    }));
  }, [rows]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name / phone / service"
          className="bg-[#0f1115] border border-[#22262e] text-[#dcdfe6] placeholder-[#9aa2ad] rounded-xl px-3 py-2 w-72"
        />
        <select
          value={range.days}
          onChange={(e) => {
            const d = Number(e.target.value);
            setRange(ranges.find((r) => r.days === d) || ranges[1]);
          }}
          className="bg-[#0f1115] border border-[#22262e] text-[#dcdfe6] rounded-xl px-3 py-2"
        >
          {ranges.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl shadow-lg bg-[#0f1115] border border-[#22262e] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[#9aa2ad] bg-[#0a0a0b]">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Time</th>
              <th className="text-left px-4 py-3">Service</th>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Source</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Price</th>
            </tr>
          </thead>
          <tbody className="text-[#dcdfe6]">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[#9aa2ad]">
                  Loading…
                </td>
              </tr>
            ) : computed.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-[#9aa2ad]">
                  No appointments.
                </td>
              </tr>
            ) : (
              computed.map((r) => (
                <tr key={r.id} className="border-t border-[#22262e]/60">
                  <td className="px-4 py-3">{formatDate(r.start_ts)}</td>
                  <td className="px-4 py-3">{formatTime(r.start_ts)}</td>
                  <td className="px-4 py-3">{r.normalized_service ?? r.service_raw ?? '-'}</td>
                  <td className="px-4 py-3">{r.caller_name ?? '-'}</td>
                  <td className="px-4 py-3">{prettyPhone(r.caller_phone_e164)}</td>
                  <td className="px-4 py-3">{r.source ?? '-'}</td>
                  <td className="px-4 py-3">{r.status}</td>
                  <td className="px-4 py-3">{fmtUSD(r.derived_price ?? null)}</td>
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
      <AppointmentsInner />
    </Suspense>
  );
}
