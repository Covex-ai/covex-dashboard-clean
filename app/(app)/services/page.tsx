"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import Segmented from "@/components/Segmented";
import { ChartTooltip } from "@/components/ChartTooltip";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { priceFor, serviceLabelFor } from "@/lib/pricing";

type Row = {
  id: number;
  start_ts: string;
  status: "Booked" | "Rescheduled" | "Cancelled";
  normalized_service: string | null;
  service_raw: string | null;
  price_usd: string | number | null;
};

const toNumber = (v: string | number | null | undefined): number =>
  typeof v === "number" ? v : v ? Number(v) : 0;

export default function ServicesPage() {
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
    let mounted = true;
    (async () => {
      const from = new Date();
      from.setDate(from.getDate() - 90);

      const { data, error } = await supabase
        .from("appointments")
        .select("id,start_ts,status,normalized_service,service_raw,price_usd")
        .gte("start_ts", from.toISOString())
        .order("start_ts", { ascending: true });

      if (!mounted) return;
      if (!error && data) setRows(data as unknown as Row[]);
    })();

    return () => {
      mounted = false;
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

  // Aggregate
  const byService = useMemo(() => {
    const mapCount = new Map<string, number>();
    const mapRev = new Map<string, number>();

    for (const r of visible) {
      const label = serviceLabelFor(r.normalized_service, r.service_raw);
      mapCount.set(label, (mapCount.get(label) ?? 0) + 1);
      if (r.status !== "Cancelled") {
        mapRev.set(
          label,
          (mapRev.get(label) ?? 0) + priceFor(r.normalized_service, toNumber(r.price_usd))
        );
      }
    }

    return Array.from(mapCount.keys()).map((label) => ({
      service: label,
      bookings: mapCount.get(label) ?? 0,
      revenue: mapRev.get(label) ?? 0,
    }));
  }, [visible]);

  const top = byService
    .slice()
    .sort((a, b) => b.revenue - a.revenue)[0];

  const totalBookings = visible.length;
  const totalRevenue = byService.reduce((s, x) => s + x.revenue, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header metrics + range */}
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full md:w-auto">
          <div className="card p-4">
            <div className="text-sm text-cx-muted mb-1">Top Service</div>
            {top ? (
              <>
                <div className="font-semibold">{top.service}</div>
                <div className="text-sm text-cx-muted">{top.bookings} bookings • ${top.revenue}</div>
              </>
            ) : (
              <div className="text-sm text-cx-muted">—</div>
            )}
          </div>

          <div className="card p-4">
            <div className="text-sm text-cx-muted mb-1">Total Bookings</div>
            <div className="font-semibold text-2xl">{totalBookings}</div>
          </div>

          <div className="card p-4">
            <div className="text-sm text-cx-muted mb-1">Revenue (excl. Cancelled)</div>
            <div className="font-semibold text-2xl">${totalRevenue}</div>
          </div>
        </div>

        <Segmented
          value={range}
          onChange={(v) => setRange(v as any)}
          options={[
            { key: "7", label: "7 days" },
            { key: "30", label: "30 days" },
            { key: "90", label: "90 days" },
          ]}
        />
      </div>

      {/* Bookings by service (bar) */}
      <div className="card p-4">
        <div className="text-sm text-cx-muted mb-2">Bookings by service (last {days}d)</div>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byService} margin={{ left: 8, right: 8, top: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="service" interval={0} tickMargin={12} />
              <YAxis allowDecimals={false} />
              <Tooltip
                content={({ label, payload }) => (
                  <ChartTooltip
                    label={label}
                    items={(payload ?? []).map((p) => ({
                      name: p?.dataKey === "bookings" ? "Bookings" : "Revenue",
                      value:
                        p?.dataKey === "bookings"
                          ? (p?.value as number) ?? 0
                          : `$${(p?.value as number) ?? 0}`,
                    }))}
                  />
                )}
              />
              <Bar dataKey="bookings" fill="var(--cx-accent)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Breakdown table */}
      <div className="card p-4">
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Bookings</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {byService.map((r) => (
              <tr key={r.service}>
                <td className="text-cx-text">{r.service}</td>
                <td>{r.bookings}</td>
                <td>${r.revenue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
