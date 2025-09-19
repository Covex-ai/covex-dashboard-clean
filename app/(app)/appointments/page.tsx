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
  start_ts: string;          // timestamptz
  end_ts: string | null;
  received_date: string | null;
  price_usd: string | number | null;
};

type RangeKey = 'today' | 'past7' | 'past30' | 'past90' | 'future';

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today',
  past7: 'Past 7',
  past30: 'Past 30',
  past90: 'Past 90',
  future: 'Future',
};

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function withinRange(ts: string, range: RangeKey) {
  const dt = new Date(ts);

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  switch (range) {
    case 'today':
      return dt >= todayStart && dt <= todayEnd;
    case 'past7': {
      const from = new Date(todayStart);
      from.setDate(from.getDate() - 7);
      return dt >= from && dt < todayStart;
    }
    case 'past30': {
      const from = new Date(todayStart);
      from.setDate(from.getDate() - 30);
      return dt >= from && dt < todayStart;
    }
    case 'past90': {
      const from = new Date(todayStart);
      from.setDate(from.getDate() - 90);
      return dt >= from && dt < todayStart;
    }
    case 'future':
      return dt > todayEnd;
  }
}

function fmtDate(ts: string) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' });
}
function fmtTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function prettyPhone(e164?: string | null) {
  if (!e164) return '—';
  // naive pretty format (+1 NNN NNN-NNNN)
  const m = e164.match(/^\+?1?(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

export default function AppointmentsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<RangeKey>('past30'); // sensible default
  const [loading, setLoading] = useState(true);

  // Fetch + realtime
  useEffect(() => {
    let canceled = false;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('appointments')
        .select(
          'id,business_id,booking_id,status,source,caller_name,caller_phone_e164,service_raw,normalized_service,start_ts,end_ts,received_date,price_usd'
        )
        .order('start_ts', { ascending: false })
        .limit(1000); // UI cap; adjust if you need more

      if (!canceled) {
        if (error) console.error(error);
        setRows((data ?? []) as Row[]);
        setLoading(false);
      }
    }

    load();

    // Realtime
    const ch = supabase
      .channel('rt:appointments')
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

  // Search + range filter
  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      const inRange = withinRange(r.start_ts, range);
      if (!inRange) return false;

      if (!s) return true;
      const hay =
        [
          r.caller_name ?? '',
          r.caller_phone_e164 ?? '',
          r.service_raw ?? '',
          r.normalized_service ?? '',
          r.status ?? '',
          r.source ?? '',
        ]
          .join(' ')
          .toLowerCase();
      return hay.includes(s);
    });
  }, [rows, search, range]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-[#dcdfe6] text-2xl font-semibold">Appointments</h1>

        <div className="flex items-center gap-3">
          {/* Range selector */}
          <div className="inline-flex rounded-xl border border-[#22262e] overflow-hidden">
            {(['today', 'past7', 'past30', 'past90', 'future'] as RangeKey[]).map((k) => (
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

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / phone / service"
            className="w-72 rounded-xl bg-[#0f1115] border border-[#22262e] px-3 py-2 text-sm text-[#dcdfe6] placeholder-[#9aa2ad] focus:outline-none focus:ring-2 focus:ring-[#3b82f6]/40"
          />
        </div>
      </div>

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
                  No appointments match this filter.
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const price = priceFor(r.normalized_service, r.price_usd);
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
                  <tr
                    key={r.id}
                    className={`border-t border-[#22262e] ${r.status === 'Cancelled' ? 'opacity-60' : ''}`}
                  >
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
