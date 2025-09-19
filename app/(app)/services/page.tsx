"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import {
  fmtUSD,
  priceFor,
  serviceLabelFor,
  normalizeService,
  toNumber,
  type NormalizedService,
} from "@/lib/pricing";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

type Row = {
  id: number;
  start_ts: string; // ISO
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | string;
  price_usd: number | string | null;
};

type RangeKey = 7 | 30 | 90;
const RANGE_OPTIONS: RangeKey[] = [7, 30, 90];

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
          {r}d
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

function Metric({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-cx-border bg-cx-surface p-4">
      <div className="text-sm font-medium text-white/70">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
        {value}
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const businessId = useBusinessId();

  const [range, setRange] = useState<RangeKey>(90);
  const [rowsAll, setRowsAll] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // Load last 90d, filter locally for 7/30/90
  useEffect(() => {
    if (!businessId) return;
    let cancelled = false;
    (async () => {
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
    })();
    return () => {
      cancelled = true;
    };
  }, [businessId, supabase]);

  const rows = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - range);
    return rowsAll.filter((r) => new Date(r.start_ts) >= since);
  }, [rowsAll, range]);

  // Aggregate by normalized service
  const byService = useMemo(() => {
    type Agg = { label: string; bookings: number; revenue: number };
    const map = new Map<NormalizedService, Agg>();

    for (const r of rows) {
      // Skip cancelled revenue but still count booking? (You can change this if you prefer.)
      const includeRevenue = r.status !== "Cancelled";
      const normalized: NormalizedService = (
        r.normalized_service ?? normalizeService(r.service_raw ?? "")
      ) as NormalizedService;

      const key: NormalizedService = normalized; // <- force Map key to correct type
      const prev: Agg =
        map.get(key) ?? {
          label: serviceLabelFor(normalized, r.service_raw),
          bookings: 0,
          revenue: 0,
        };

      prev.bookings += 1;
      if (includeRevenue) {
        prev.revenue += priceFor(normalized, toNumber(r.price_usd));
      }

      map.set(key, prev);
    }

    // Prepare chart rows, sort by label
    const chartRows = Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );

    // KPIs
    const totalBookings = chartRows.reduce((s, r) => s + r.bookings, 0);
    const totalRevenue = chartRows.reduce((s, r) => s + r.revenue, 0);
    const topByRevenue =
      chartRows.slice().sort((a, b) => b.revenue - a.revenue)[0] ?? null;
    const topByBookings =
      chartRows.slice().sort((a, b) => b.bookings - a.bookings)[0] ?? null;

    return {
      chartRows,
      totalBookings,
      totalRevenue,
      topByRevenue,
      topByBookings,
    };
  }, [rows]);

  const tooltipStyle =
    "rounded-xl border border-cx-border bg-[#0b0b0c] px-3 py-2 shadow-xl";
  const tooltipLabel = "text-[13px] text-white/80";
  const tooltipValue = "mt-1 text-[13px] font-semibold text-white";

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Metric
          title={`Total bookings (${range}d)`}
          value={byService.totalBookings}
        />
        <Metric
          title={`Total revenue (${range}d)`}
          value={fmtUSD(byService.totalRevenue)}
        />
        <div className="rounded-2xl border border-cx-border bg-cx-surface p-4">
          <div className="text-sm font-medium text-white/70">
            Range
          </div>
          <div className="mt-2">
            <RangePills value={range} onChange={setRange} />
          </div>
        </div>
      </div>

      {/* Revenue by service */}
      <div className="mt-6 grid grid-cols-1 gap-6">
        <Card
          title={`Revenue by service (last ${range} days)`}
          right={<RangePills value={range} onChange={setRange} />}
        >
          <div className="h-[360px]">
            {loading ? (
              <div className="flex h-full items-center justify-center text-white/60">
                Loading…
              </div>
            ) : byService.chartRows.length === 0 ? (
              <div className="flex h-full items-center justify-center text-white/60">
                No data in the selected range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byService.chartRows} barSize={36}>
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
                    tick={{ fill: "#7f8796", fontSize: 12 }}
                    stroke="#7f8796"
                  />
                  <Tooltip
                    content={({ label, payload }) => (
                      <div className={tooltipStyle}>
                        <div className={tooltipLabel}>{label}</div>
                        <div className={tooltipValue}>
                          {fmtUSD(toNumber(payload?.[0]?.value) ?? 0)}
                        </div>
                      </div>
                    )}
                  />
                  <Bar dataKey="revenue" fill="#e5e7eb" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Summary card */}
        <Card title="What’s performing best?">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-cx-border bg-cx-bg p-4">
              <div className="text-sm text-white/60">Top by Revenue</div>
              <div className="mt-2 text-lg font-semibold text-white">
                {byService.topByRevenue
                  ? `${byService.topByRevenue.label} — ${fmtUSD(
                      byService.topByRevenue.revenue
                    )}`
                  : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-cx-border bg-cx-bg p-4">
              <div className="text-sm text-white/60">Top by Bookings</div>
              <div className="mt-2 text-lg font-semibold text-white">
                {byService.topByBookings
                  ? `${byService.topByBookings.label} — ${
                      byService.topByBookings.bookings
                    }`
                  : "—"}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
