'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabaseBrowser';
import StatusBadge, { ApptStatus } from '@/components/StatusBadge';
import { When } from '@/components/When';
import { priceFor, fmtUSD } from '@/lib/pricing';

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
  start_ts: string;   // timestamptz (ISO)
  end_ts: string | null;
  price_usd: string | number | null;
  updated_at?: string | null; // optional (if you added audit columns)
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function prettyPhone(p?: string | null) {
  if (!p) return '-';
  try {
    // simple pretty: +1 864 477-0924
    const clean = p.replace(/[^\d+]/g, '');
    if (clean.startsWith('+1') && clean.length === 12) {
      return `+1 (${clean.slice(2,5)}) ${clean.slice(5,8)}-${clean.slice(8)}`;
    }
    return clean;
  } catch {
    return p;
  }
}

function Inner() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const params = useSearchParams();

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [range, setRange] = useState<'7' | '30' | '90' | 'Future'>('30');
  const [showCancelled, setShowCancelled] = useState(false);

  // Resolve business id: ?biz= overrides; otherwise read the current user's profile.business_id
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
        // no auth (mock). Keep biz as null; expect server to be publicly readable or demo mode.
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

      let query = supabase
        .from('appointments')
        .select(
          'id,business_id,booking_id,status,source,caller_name,caller_phone_e164,service_raw,normalized_service,start_ts,end_ts,price_usd,updated_at'
        )
        .order('start_ts', { ascending: true });

      // Scope by business if present (RLS enforces this in prod anyway)
      if (biz) query = query.eq('business_id', biz);

      // Date range filter
      const now = new Date();
      if (range !== 'Future') {
        const days = range === '7' ? 7 : range === '30' ? 30 : 90;
        const from = new Date(now.getTime() - days * 864e5).toISOString();
        query = query.gte('start_ts', from).lte('start_ts', new Date().toISOString());
      } else {
        query = query.gte('start_ts', now.toISOString());
      }

      const { data, error } = await query;
      if (!error && data) setRows(data as Row[]);
      setLoading(false);
    })();
  }, [supabase, biz, range]);

  // Client-side filters
  const visible = rows
    .filter((r) => (showCancelled ? true : r.status !== 'Cancelled'))
    .filter((r) => {
      if (!q) return true;
      const hay = `${r.caller_name ?? ''} ${r.caller_phone_e164 ?? ''} ${r.service_raw ?? ''} ${r.normalized_service ?? ''}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    });

  return (
    <div className="p-6">
      <div className="text-[#dcdfe6] text-xl mb-4">Appointments</div>

      {/* Controls */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name / phone / service"
          className="w-full max-w-md bg-[#0a0a0b] border border-[#22262e] rounded-xl px-3 py-2 text-[#dcdfe6] placeholder-[#9aa2ad]"
        />
        <div className="flex items-center gap-2">
          {(['7', '30', '90', 'Future'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-xl border ${range === r ? 'bg-[#3b82f6] border-[#3b82f6] text-white' : 'bg-[#0f1115] border-[#22262e] text-[#dcdfe6]'}`}
            >
              {r === 'Future' ? 'Future' : `${r} days`}
            </button>
          ))}
          <label className="ml-3 inline-flex items-center gap-2 text-sm text-[#9aa2ad]">
            <input
              type="checkbox"
              className="accent-[#3b82f6]"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
            />
            Include cancelled
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden border border-[#22262e] bg-[#0f1115]">
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
            ) : visible.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-[#9aa2ad]">No appointments</td></tr>
            ) : (
              visible.map((r) => {
                const price = priceFor(r.normalized_service, r.price_usd);
                return (
                  <tr key={r.id} className={`border-t border-[#22262e] ${r.status === 'Cancelled' ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-[#dcdfe6]">{fmtDate(r.start_ts)}</td>
                    <td className="px-4 py-3 text-[#dcdfe6]">
                      {fmtTime(r.start_ts)}
                      {r.status === 'Rescheduled' && (
                        <span className="ml-2 text-xs text-[#f5c451]">rescheduled</span>
                      )}
                      <When ts={r.updated_at} />
                    </td>
                    <td className="px-4 py-3 text-[#dcdfe6]">{r.normalized_service || r.service_raw || '-'}</td>
                    <td className="px-4 py-3 text-[#dcdfe6]">{r.caller_name || '-'}</td>
                    <td className="px-4 py-3 text-[#dcdfe6]">{prettyPhone(r.caller_phone_e164)}</td>
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
