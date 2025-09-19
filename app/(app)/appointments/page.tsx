'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { createBrowserClient } from '@/lib/supabaseBrowser';
import { fmtUSD, priceFor, serviceLabelFor, toNumber, NormalizedService } from '@/lib/pricing';

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

type RangeKey = 'today' | '7' | '30' | '90' | 'future';

const RANGE_LABEL: Record<RangeKey, string> = {
  today: 'Today',
  '7': 'Past 7d',
  '30': 'Past 30d',
  '90': 'Past 90d',
  future: 'Future',
};

function prettyPhone(e164?: string | null) {
  if (!e164) return '—';
  const m = e164.replace(/[^\d]/g, '').match(/^1?(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}
function fmtDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
}
function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-[#9aa2ad]">Loading…</div>}>
      <AppointmentsInner />
    </Suspense>
  );
}

function AppointmentsInner() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  // controls
  const [q, setQ] = useState('');
  const [range, setRange] = useState<RangeKey>('today');

  useEffect(() => {
    let canceled = false;

    async function load() {
      setLoading(true);

      // find user's business_id
      const { data: profile, error: pErr } = await supabase.from('profiles').select('business_id').maybeSingle();
      if (pErr) console.error(pErr);

      if (!profile?.business_id) {
        setRows([]);
        setLoading(false);
        return;
      }

      // fetch a wide window and filter client-side for range tabs + search
      const since = new Date();
      since.setDate(since.getDate() - 120);

      const { data, error } = await supabase
        .from('appointments')
        .select(
          'id,business_id,booking_id,status,source,caller_name,caller_phone_e164,service_raw,normalized_service,start_ts,end_ts,received_date,price_usd'
        )
        .eq('business_id', profile.business_id)
        .gte('start_ts', since.toISOString())
        .order('start_ts', { ascending: false })
        .limit(3000);

      if (!canceled) {
        if (error) console.error(error);
        setRows((data ?? []) as Row[]);
        setLoading(false);
      }
    }

    load();

    // realtime updates (no refresh needed)
    const ch = supabase
      .channel('rt:appointments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          setRows((cur) => {
            const r = (payload.new ?? payload.old) as Row;
            const i = cur.findIndex((x) => x.id === r.id);
            const next = [...cur];
            if (payload.eventType === 'DELETE') {
              if (i >= 0) next.splice(i, 1);
            } else if (i >= 0) {
              next[i] = r;
            } else {
              next.unshift(r);
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

  // filter by range
  const filteredByRange = (() => {
    const now = new Date();

    if (range === 'future') {
      return rows.filter((r) => new Date(r.start_ts) > now);
    }
    if (range === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return rows.filter((r) => {
        const d = new Date(r.start_ts);
        return d >= start && d <= end;
      });
    }

    const days = parseInt(range, 10);
    const from = new Date();
    from.setDate(from.getDate() - days);
    return rows.filter((r) => new Date(r.start_ts) >= from && new Date(r.start_ts) <= now);
  })();

  // search filter (name / phone / service)
  const visible = filteredByRange.filter((r) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    const hay = [
      r.caller_name ?? '',
      r.caller_phone_e164 ?? '',
      r.service_raw ?? '',
      r.normalized_service ?? '',
      r.source ?? '',
      r.status ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(needle);
  });

  return (
    <div className="p-6 space-y-4">
      {/* header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[#dcdfe6] text-2xl font-semibold">Appointments</h1>

        {/* range + search */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-xl border border-[#22262e] overflow-hidden">
            {(['today', '7', '30', '90', 'future'] as RangeKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setRange(k)}
                className={`px-3 py-1.5 text-sm ${
                  range === k ? 'bg-[#3b82f6] text-white' : 'text-[#9aa2ad] hover:text-[#dcdfe6]'
                }`}
                title={RANGE_LABEL[k]}
              >
                {RANGE_LABEL[k]}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-[#22262e] bg-[#0f1115] px-3 py-1.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone, service…"
              className="bg-transparent outline-none text-sm text-[#dcdfe6] placeholder-[#9aa2ad]"
            />
          </div>
        </div>
      </div>

      {/* table */}
      <div className="rounded-2xl border border-[#22262e] bg-[#0f1115] shadow-lg overflow-hidden">
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
            ) : visible.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-[#9aa2ad]" colSpan={8}>
                  No appointments found.
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const label = serviceLabelFor(r.normalized_service, r.service_raw);
                const price = priceFor(r.normalized_service, toNumber(r.price_usd));
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
