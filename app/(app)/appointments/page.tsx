"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import RangePills from "@/components/RangePills";
import {
  fmtUSD,
  normalizeService,
  priceFor,
  serviceLabelFor,
  toNumber,
  type NormalizedService,
} from "@/lib/pricing";

type Range = "7d" | "30d" | "90d";
type Status = "All" | "Booked" | "Rescheduled" | "Cancelled" | "Completed";

type ApptRow = {
  id: number;
  start_ts: string;
  end_ts: string | null;
  name: string | null;
  phone: string | null;
  status: string | null; // raw from DB; we normalize below
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  price_usd: number | string | null;
};

function normalizeStatus(s: string | null | undefined): Status | null {
  if (!s) return null;
  const t = s.trim().toLowerCase();
  if (t === "booked") return "Booked";
  if (t === "rescheduled") return "Rescheduled";
  if (t === "cancelled") return "Cancelled";
  if (t === "completed") return "Completed";
  return null;
}

function StatusBadge({ value }: { value: Status | null }) {
  // subtle, professional badges on pure black
  const base =
    "inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border";
  if (value === "Booked")
    return (
      <span className={`${base} border-emerald-700/40 bg-emerald-500/15 text-emerald-300`}>
        Booked
      </span>
    );
  if (value === "Rescheduled")
    return (
      <span className={`${base} border-amber-700/40 bg-amber-500/15 text-amber-300`}>
        Rescheduled
      </span>
    );
  if (value === "Cancelled")
    return (
      <span className={`${base} border-rose-700/40 bg-rose-500/15 text-rose-300`}>
        Cancelled
      </span>
    );
  if (value === "Completed")
    return (
      <span className={`${base} border-white/20 bg-white/10 text-cx-muted`}>
        Completed
      </span>
    );
  return <span className={`${base} border-cx-border text-cx-muted`}>-</span>;
}

export default function AppointmentsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [range, setRange] = useState<Range>("30d");
  const [status, setStatus] = useState<Status>("All");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ApptRow[]>([]);

  function daysFor(r: Range) {
    return r === "7d" ? 7 : r === "30d" ? 30 : 90;
  }

  async function load() {
    const days = daysFor(range);
    const from = new Date();
    from.setDate(from.getDate() - days);

    // Always fetch all statuses in-range, then filter client-side:
    // this fixes cases where "Completed" didn't match due to spacing/case.
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .gte("start_ts", from.toISOString())
      .order("start_ts", { ascending: false });

    if (error) return;

    const all = (data as unknown as ApptRow[]) ?? [];

    const filteredByStatus =
      status === "All"
        ? all
        : all.filter((r) => normalizeStatus(r.status) === status);

    const filtered = q.trim()
      ? filteredByStatus.filter((r) => {
          const hay = `${r.name ?? ""} ${r.phone ?? ""} ${r.service_raw ?? ""}`.toLowerCase();
          return hay.includes(q.toLowerCase());
        })
      : filteredByStatus;

    setRows(filtered);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, status, q]);

  useEffect(() => {
    const ch = supabase
      .channel("rt-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex gap-2">
          <RangePills value={range} onChange={setRange} />

          {/* Legible native select: dark control; white popup with black text */}
          <select
            className="btn-pill bg-white/5 text-white [color-scheme:dark]"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            {["All", "Booked", "Rescheduled", "Cancelled", "Completed"].map((s) => (
              <option key={s} value={s} className="text-black bg-white">
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Prevent cutoff on desktop */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, service"
          className="px-3 py-2 rounded-xl bg-cx-surface border border-cx-border text-sm outline-none w-full md:w-80"
        />
      </div>

      {/* Table */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-cx-muted">
            <tr className="text-left">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Time</th>
              <th className="py-2 pr-4">Service</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ns = r.normalized_service ?? normalizeService(r.service_raw);
              const st = normalizeStatus(r.status);
              return (
                <tr key={r.id} className="border-t border-cx-border">
                  <td className="py-2 pr-4">
                    {new Date(r.start_ts).toLocaleDateString()}
                  </td>
                  <td className="py-2 pr-4">
                    {new Date(r.start_ts).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2 pr-4">{serviceLabelFor(ns, r.service_raw)}</td>
                  <td className="py-2 pr-4">{r.name ?? "-"}</td>
                  <td className="py-2 pr-4">{r.phone ?? "-"}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge value={st} />
                  </td>
                  <td className="py-2 pr-4">
                    {fmtUSD(priceFor(ns, toNumber(r.price_usd)))}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="py-6 text-center text-cx-muted" colSpan={7}>
                  No results.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
