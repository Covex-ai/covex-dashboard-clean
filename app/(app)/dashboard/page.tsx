"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import Stat from "@/components/Stat";
import Segmented from "@/components/Segmented";
import { ChartTooltip } from "@/components/ChartTooltip";
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
import { priceFor, serviceLabelFor } from "@/lib/pricing";

type Row = {
  id: number;
  business_id: string;
  start_ts: string;
  status: "Booked" | "Rescheduled" | "Cancelled";
  normalized_service: string | null;
  service_raw: string | null;
  price_usd: string | number | null;
};

const toNumber = (v: string | number | null | undefined): number =>
  typeof v === "number" ? v : v ? Number(v) : 0;

export default function DashboardPage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}

function Content() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [range, setRange] = useState<"7" | "30" | "90">("30");

  useEffect(() => {
    let isMounted = true;
    (async () => {
      // last 90 days, we’ll filter in-memory for the segmented control
      const from = new Date();
      from.setDate(from.getDate() - 90);

      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id,business_id,start_ts,status,normalized_service,service_raw,price_usd"
        )
        .gte("start_ts", from.toISOString())
        .order("start_ts", { ascending: true });

      if (!isMounted) return;
      if (!error && data) setRows(data as unknown as Row[]);
    })();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const days = range === "7" ? 7 : range === "90" ? 90 : 30;
  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }, [days]);

  const visible = useMemo(
    () => rows.filter((r) => new Date(r.start_ts) >= since),
    [rows, since]
  );

  // Stats
  const bookings = visible.length;
  const revenue = visible
    .filter((r) => r.status !== "Cancelled")
    .reduce(
      (sum, r) => sum + priceFor(r.normalized_service, toNumber(r.price_usd)),
      0
    );
  const rescheduled = visible.filter((r) => r.status === "Rescheduled").length;
  const cancelled = visible.filter((r) => r.status === "Cancelled").length;

  // Bookings per day (line with dots)
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
      map.set(key, 0);
    }
    for (const r of visible) {
      const d = new Date(r.start_ts);
      const key = d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([date, bookings]) => ({
      date,
      bookings,
    }));
  }, [visible, days, since]);

  // Revenue by service (bar)
  const byService = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of visible) {
      if (r.status === "Cancelled") continue;
      const label = serviceLabelFor(r.normalized_service, r.service_raw);
      map.set(
        label,
        (map.get(label) ?? 0) + priceFor(r.normalized_service, toNumber(r.price_usd))
      );
    }
    return Array.from(map.entries()).map(([service, revenue]) => ({
      service,
      revenue,
    }));
  }, [visible]);

  return (
    <div className="p-6 space-y-6">
      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title={`Bookings (${days}d)`} value={bookings} />
        <Stat title={`Revenue (${days}d)`} value={`$${revenue}`} />
        <Stat title={`Rescheduled (${days}d)`} value={rescheduled} />
        <Stat title={`Cancelled (${days}d)`} value={cancelled} />
      </div>

      {/* Range segmented + charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-cx-muted">Bookings per day (last {days} days)</div>
            <Segmented
              value={range}
              onChange={(v) => setRange(v as any)}
              options={[
                { key: "7", label: "7d" },
                { key: "30", label: "30d" },
                { key: "90", label: "90d" },
              ]}
            />
          </div>

          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDay} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <Tooltip
                  content={({ label, payload }) => (
                    <ChartTooltip
                      label={label}
                      items={(payload ?? []).map((p) => ({
                        name: "Bookings",
                        value: (p?.value as number) ?? 0,
                      }))}
                    />
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="bookings"
                  stroke="var(--cx-accent)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <div className="text-sm text-cx-muted mb-2">Revenue by service (last {days} days)</div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byService} margin={{ left: 8, right: 8, top: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="service" interval={0} angle={0} tickMargin={12} />
                <YAxis />
                <Tooltip
                  content={({ label, payload }) => (
                    <ChartTooltip
                      label={label}
                      items={(payload ?? []).map((p) => ({
                        name: "Revenue",
                        value: `$${(p?.value as number) ?? 0}`,
                      }))}
                    />
                  )}
                />
                <Bar dataKey="revenue" fill="var(--cx-accent)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent table */}
      <div className="card p-4">
        <div className="text-sm text-cx-muted mb-3">Recent appointments</div>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Service</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {visible
              .slice()
              .reverse()
              .slice(0, 10)
              .map((r) => {
                const d = new Date(r.start_ts);
                const price = priceFor(r.normalized_service, toNumber(r.price_usd));
                const label = serviceLabelFor(r.normalized_service, r.service_raw);
                const pillClass =
                  r.status === "Cancelled"
                    ? "pill pill--bad"
                    : r.status === "Rescheduled"
                    ? "pill pill--warn"
                    : "pill pill--ok";

                return (
                  <tr key={r.id} className={r.status === "Cancelled" ? "opacity-70" : ""}>
                    <td>{d.toLocaleDateString()}</td>
                    <td>{d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
                    <td className="text-cx-text">{label}</td>
                    <td>-</td>
                    <td>-</td>
                    <td><span className={pillClass}>{r.status}</span></td>
                    <td>{price ? `$${price}` : "-"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
