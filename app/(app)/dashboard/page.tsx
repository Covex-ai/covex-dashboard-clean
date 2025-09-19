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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

type Row = {
  id: number;
  start_ts: string; // ISO string
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  name: string | null;
  phone: string | null;
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
          {r}d
        </button>
      ))}
    </div>
  );
}

function Card({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
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

function useBusinessId() {
  const [bid, setBid] = useState<string | null>(null);
  useEffect(() => {
    // Mirror your Settings page behavior (localStorage)
    const v =
      window.localStorage.getItem("business_uuid") ??
      window.localStorage.getItem("covex_business_uuid");
    setBid(v);
  }, []);
  return bid;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const businessId = useBusinessId();

  const [range, setRange] = useState<RangeKey>(90);
  const [rowsAll, setRowsAll] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  // Load the last 90 days and filter client-side for 7/30
  useEffect(() => {
    if (!businessId) return;
    let isCancelled = false;

    async function load() {
      setLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - 90);
        const { data, error } = await supabase
          .from("appointments")
          .select(
            "id,start_ts,service_raw,normalized_service,name,phone,status,price_usd"
          )
          .eq("business_id", businessId)
          .gte("start_ts", since.toISOString())
          .order("start_ts", { ascending: true });

        if (error) throw error;
        if (!isCancelled) setRowsAll((data ?? []) as Row[]);
      } catch (e) {
        console.error(e);
        if (!isCancelled) setRowsAll([]);
      } finally {
        !isCancelled && setLoading(false);
      }
    }
    load();
    return () => {
      isCancelled = true;
    };
  }, [businessId, supabase]);

  // Filter by chosen range
  const rows = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - range);
    return rowsAll.filter((r) => new Date(r.start_ts) >= since);
  }, [rowsAll, range]);

  // Metrics
  const bookingsCount = useMemo(
    () => rows.filter((r) => r.status !== "Cancelled").length,
    [rows]
  );
  const rescheduledCount = useMemo(
    () => rows.filter((r) => r.status === "Rescheduled").length,
    [rows]
  );
  const cancelledCount = useMemo(
    () => rows.filter((r) => r.status === "Cancelled").length,
    [rows]
  );

  const revenue = useMemo(() => {
    return rows
      .filter((r) => r.status !== "Cancelled")
      .reduce((sum, r) => {
        const normalized =
          r.normalized_service ?? normalizeService(r.service_raw ?? "");
        return sum + priceFor(normalized, toNumber(r.price_usd));
      }, 0);
  }, [rows]);

  // Bookings per day (line + dots)
  const bookingsByDay = useMemo(() => {
    // Build a day bucket for each day in range to keep the chart continuous
    const start = new Date();
    start.setDate(start.getDate() - range + 1);
    start.setHours(0, 0, 0, 0);

    const days: { day: string; count: number }[] = [];
    const fmt = (d: Date) =>
      `${d.getMonth() + 1}/${d.getDate()}` as string;

    const map = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(r.start_ts);
      const key = fmt(d);
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    const iter = new Date(start);
    for (let i = 0; i < range; i++) {
      const key = fmt(iter);
      days.push({ day: key, count: map.get(key) ?? 0 });
      iter.setDate(iter.getDate() + 1);
    }
    return days;
  }, [rows, range]);

  // Revenue by service (bars)
  const revenueByService = useMemo(() => {
    const sums = new Map<NormalizedService, number>();
    for (const r of rows) {
      if (r.status === "Cancelled") continue;
      const s =
        r.normalized_service ?? normalizeService(r.service_raw ?? "");
      const v = priceFor(s, toNumber(r.price_usd));
      sums.set(s, (sums.get(s) ?? 0) + v);
    }
    const out = Array.from(sums.entries()).map(([s, v]) => ({
      service: serviceLabelFor(s, null),
      revenue: v,
    }));
    // Always show stable order by label
    out.sort((a, b) => a.service.localeCompare(b.service));
    return out;
  }, [rows]);

  // Shared tooltip (dark, readable)
  const tooltipStyle =
    "rounded-xl border border-cx-border bg-[#0b0b0c] px-3 py-2 shadow-xl";
  const tooltipLabel = "text-[13px] text-white/80";
  const tooltipValue = "mt-1 text-[13px] font-semibold text-white";

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      {/* Top metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Metric title={`Bookings (${range}d)`} value={bookingsCount} />
        <Metric title={`Revenue (${range}d)`} value={fmtUSD(revenue)} />
        <Metric title={`Rescheduled (${range}d)`} value={rescheduledCount} />
        <Metric title={`Cancelled (${range}d)`} value={cancelledCount} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title={`Bookings per day (last ${range} days)`}
          right={<RangePills value={range} onChange={setRange} />}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={bookingsByDay}>
                <CartesianGrid
                  stroke="#2a2e36"
                  strokeDasharray="4 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  stroke="#7f8796"
                  tick={{ fill: "#7f8796", fontSize: 12 }}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="#7f8796"
                  tick={{ fill: "#7f8796", fontSize: 12 }}
                />
                <Tooltip
                  content={({ label, payload }) => (
                    <div className={tooltipStyle}>
                      <div className={tooltipLabel}>{label}</div>
                      <div className={tooltipValue}>
                        bookings:{" "}
                        {payload?.[0]?.value != null
                          ? (payload[0].value as number)
                          : 0}
                      </div>
                    </div>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#e5e7eb"
                  strokeWidth={2}
                  dot={{ r: 3, stroke: "#0b0b0c", fill: "#e5e7eb" }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title={`Revenue by service (last ${range} days)`}
          right={<RangePills value={range} onChange={setRange} />}
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByService} barSize={36}>
                <CartesianGrid
                  stroke="#2a2e36"
                  strokeDasharray="4 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="service"
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
          </div>
        </Card>
      </div>

      {/* Recent appointments */}
      <div className="mt-6">
        <Card title="Recent appointments">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-white/60">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Service</th>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Phone</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Price</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-white/60"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-white/60"
                    >
                      No appointments in the selected range.
                    </td>
                  </tr>
                ) : (
                  rows
                    .slice()
                    .reverse()
                    .slice(0, 10)
                    .map((r) => {
                      const d = new Date(r.start_ts);
                      const date = d.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });
                      const time = d.toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      });
                      const normalized =
                        r.normalized_service ??
                        normalizeService(r.service_raw ?? "");
                      const price = priceFor(normalized, toNumber(r.price_usd));
                      const label = serviceLabelFor(
                        normalized,
                        r.service_raw
                      );

                      const badge =
                        r.status === "Cancelled"
                          ? "bg-red-500/15 text-red-300"
                          : r.status === "Rescheduled"
                          ? "bg-yellow-500/15 text-yellow-300"
                          : "bg-emerald-500/15 text-emerald-300";

                      return (
                        <tr
                          key={r.id}
                          className="border-t border-cx-border text-white/90"
                        >
                          <td className="px-4 py-3">{date}</td>
                          <td className="px-4 py-3">{time}</td>
                          <td className="px-4 py-3">{label}</td>
                          <td className="px-4 py-3">{r.name ?? "-"}</td>
                          <td className="px-4 py-3">{r.phone ?? "-"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${badge}`}
                            >
                              {r.status || "Booked"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {r.status === "Cancelled" ? "-" : fmtUSD(price)}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
