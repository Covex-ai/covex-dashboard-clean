"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import {
  fmtUSD,
  priceFor,
  normalizeService,
  serviceLabelFor,
  toNumber,
  type NormalizedService,
} from "@/lib/pricing";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Row = {
  id: number;
  start_ts: string;
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | string;
  price_usd: number | string | null;
};

type RangeKey = 7 | 30 | 90;
const RANGE_OPTIONS: RangeKey[] = [7, 30, 90];

function RangePills({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
}) {
  return (
    <div className="flex gap-2">
      {RANGE_OPTIONS.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-3 py-1.5 rounded-xl text-sm font-medium transition
            ${value === r ? "bg-white/10 text-white" : "bg-white/5 text-white/70 hover:text-white"}`}
        >
          {r} days
        </button>
      ))}
    </div>
  );
}

function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-cx-border bg-cx-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium text-white/80">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function useBusinessId() {
  const [bid, setBid] = useState<string | null>(null);
  useEffect(() => {
    const v =
      window.localStorage.getItem("business_uuid") ??
      window.localStorage.getItem("covex_business_uuid");
    setBid(v);
  }, []);
  return bid;
}

export default function ServicesPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const businessId = useBusinessId();

  const [range, setRange] = useState<RangeKey>(30);
  const [rowsAll, setRowsAll] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - 90);
        const { data, error } = await supabase
          .from("appointments")
          .select(
            "id,start_ts,service_raw,normalized_service,status,price_usd"
          )
          .eq("business_id", businessId)
          .gte("start_ts", since.toISOString())
          .order("start_ts", { ascending: true });

        if (error) throw error;
        if (!cancelled) setRowsAll((data ?? []) as Row[]);
      } catch (e) {
        console.error(e);
        if (!cancelled) setRowsAll([]);
      } finally {
        !cancelled && setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [businessId, supabase]);

  const rows = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - range);
    return rowsAll.filter((r) => new Date(r.start_ts) >= since);
  }, [rowsAll, range]);

  // Aggregations by normalized service
  const byService = useMemo(() => {
    const map = new Map<
      NormalizedService,
      { label: string; bookings: number; revenue: number }
    >();

    for (const r of rows) {
      const s =
        r.normalized_service ?? normalizeService(r.service_raw ?? "");
      const key = s;

      const prev = map.get(key) ?? {
        label: serviceLabelFor(s, r.service_raw),
        bookings: 0,
        revenue: 0,
      };

      prev.bookings += 1;
      if (r.status !== "Cancelled") {
        prev.revenue += priceFor(s, toNumber(r.price_usd));
      }
      map.set(key, prev);
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => b.revenue - a.revenue);
    return arr;
  }, [rows]);

  const totalBookings = useMemo(
    () => byService.reduce((s, x) => s + x.bookings, 0),
    [byService]
  );
  const totalRevenue = useMemo(
    () => byService.reduce((s, x) => s + x.revenue, 0),
    [byService]
  );
  const top = byService[0];

  const tooltipStyle =
    "rounded-xl border border-cx-border bg-[#0b0b0c] px-3 py-2 shadow-xl";
  const tooltipLabel = "text-[13px] text-white/80";
  const tooltipValue = "mt-1 text-[13px] font-semibold text-white";

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-cx-border bg-cx-surface p-4">
          <div className="text-sm font-medium text-white/70">Top Service</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {top ? top.label : "-"}
          </div>
          <div className="mt-1 text-sm text-white/70">
            {top ? `${top.bookings} bookings • ${fmtUSD(top.revenue)}` : "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-cx-border bg-cx-surface p-4">
          <div className="text-sm font-medium text-white/70">
            Total Bookings ({range}d)
          </div>
          <div className="mt-2 text-3xl font-semibold text-white">
            {totalBookings}
          </div>
        </div>
        <div className="rounded-2xl border border-cx-border bg-cx-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium text-white/70">
              Revenue (excl. Cancelled)
            </div>
            <RangePills value={range} onChange={setRange} />
          </div>
          <div className="text-3xl font-semibold text-white">
            {fmtUSD(totalRevenue)}
          </div>
        </div>
      </div>

      <Card
        title={`Bookings by service (last ${range}d)`}
        right={null}
      >
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byService} barSize={42}>
              <CartesianGrid
                stroke="#2a2e36"
                strokeDasharray="4 4"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fill: "#7f8796", fontSize: 12 }}
                stroke="#7f8796"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#7f8796", fontSize: 12 }}
                stroke="#7f8796"
              />
              <Tooltip
                content={({ label, payload }) => (
                  <div className={tooltipStyle}>
                    <div className={tooltipLabel}>{label}</div>
                    <div className={tooltipValue}>
                      {fmtUSD(toNumber(payload?.[0]?.payload?.revenue) ?? 0)} •{" "}
                      {payload?.[0]?.payload?.bookings ?? 0} bookings
                    </div>
                  </div>
                )}
              />
              <Bar dataKey="bookings" fill="#e5e7eb" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Table */}
      <div className="mt-6 rounded-2xl border border-cx-border bg-cx-surface">
        <div className="border-b border-cx-border px-4 py-3 text-sm font-medium text-white/80">
          Services
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/60">
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2">Bookings</th>
                <th className="px-4 py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-white/60"
                  >
                    Loading…
                  </td>
                </tr>
              ) : byService.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-white/60"
                  >
                    No data in the selected range.
                  </td>
                </tr>
              ) : (
                byService.map((s, i) => (
                  <tr key={i} className="border-t border-cx-border">
                    <td className="px-4 py-3 text-white/90">{s.label}</td>
                    <td className="px-4 py-3 text-white/90">{s.bookings}</td>
                    <td className="px-4 py-3 text-white/90">
                      {fmtUSD(s.revenue)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
