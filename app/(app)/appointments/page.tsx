"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import { fmtUSD, normalizeService, priceFor, serviceLabelFor, toNumber, type NormalizedService } from "@/lib/pricing";

type View = "today" | "future" | "all";
type Range = "7d" | "30d" | "90d";
type StatusOpt = "All" | "Booked" | "Rescheduled" | "Cancelled" | "Completed";

type Row = {
  id: number;
  start_ts: string;
  end_ts: string | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | "Completed" | null;
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  price_usd: number | string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
};

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfTodayISO() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function tomorrowStartISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function AppointmentsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [view, setView] = useState<View>("today");      // DEFAULT = Today
  const [range, setRange] = useState<Range>("7d");      // for list ranges
  const [statusFilter, setStatusFilter] = useState<StatusOpt>("All");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    let query = supabase.from("appointments").select(
      "id,start_ts,end_ts,status,service_raw,normalized_service,price_usd,caller_name,caller_phone_e164"
    );

    if (view === "today") {
      query = query.gte("start_ts", startOfTodayISO()).lte("start_ts", endOfTodayISO());
    } else if (view === "future") {
      query = query.gte("start_ts", tomorrowStartISO());
    } else {
      // all (bounded by range)
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
      query = query.gte("start_ts", daysAgoISO(days));
    }

    query = query.order("start_ts", { ascending: true });
    const { data, error } = await query;
    if (!error && data) setRows(data as any);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [view, range, statusFilter, q]);

  // realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel("rt-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // client filters
  const filtered = rows.filter(r => {
    // status filter
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    // search
    if (q.trim()) {
      const hay =
        `${r.caller_name ?? ""} ${r.caller_phone_e164 ?? ""} ${r.service_raw ?? ""}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Top bar: tabs + New button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`btn-pill ${view === "today" ? "btn-pill--active" : ""}`}
            onClick={() => setView("today")}
          >
            Today
          </button>
          <button
            type="button"
            className={`btn-pill ${view === "future" ? "btn-pill--active" : ""}`}
            onClick={() => setView("future")}
          >
            Future
          </button>
          <button
            type="button"
            className={`btn-pill ${view === "all" ? "btn-pill--active" : ""}`}
            onClick={() => setView("all")}
          >
            All
          </button>

          {/* Range pills only really matter for "All" view, but keep visible for convenience */}
          <button
            type="button"
            className={`btn-pill ${range === "7d" ? "btn-pill--active" : ""}`}
            onClick={() => setRange("7d")}
          >
            7d
          </button>
          <button
            type="button"
            className={`btn-pill ${range === "30d" ? "btn-pill--active" : ""}`}
            onClick={() => setRange("30d")}
          >
            30d
          </button>
          <button
            type="button"
            className={`btn-pill ${range === "90d" ? "btn-pill--active" : ""}`}
            onClick={() => setRange("90d")}
          >
            90d
          </button>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusOpt)}
            className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none [color-scheme:dark]"
          >
            {["All","Booked","Rescheduled","Cancelled","Completed"].map(s => (
              <option key={s} value={s} className="text-black bg-white">{s}</option>
            ))}
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, service"
            className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none w-64"
          />

          {/* The NEW button you needed */}
          <Link href="/appointments/new" className="btn-pill btn-pill--active">
            + New
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-0 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-cx-muted">
            <tr className="text-left">
              <th className="py-3 pl-4 pr-4">Date</th>
              <th className="py-3 pr-4">Time</th>
              <th className="py-3 pr-4">Service</th>
              <th className="py-3 pr-4">Name</th>
              <th className="py-3 pr-4">Phone</th>
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Price</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const ns = r.normalized_service ?? normalizeService(r.service_raw);
              return (
                <tr key={r.id} className="border-t border-cx-border">
                  <td className="py-2 pl-4 pr-4">{new Date(r.start_ts).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">
                    {new Date(r.start_ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </td>
                  <td className="py-2 pr-4">{serviceLabelFor(ns, r.service_raw)}</td>
                  <td className="py-2 pr-4">{r.caller_name ?? "-"}</td>
                  <td className="py-2 pr-4">{r.caller_phone_e164 ?? "-"}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status ?? "Booked"} />
                  </td>
                  <td className="py-2 pr-4">{fmtUSD(priceFor(ns, toNumber(r.price_usd)))}</td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-cx-muted">
                  No results.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-cx-muted">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  let bg = "bg-white/10 text-white";
  if (s === "booked") bg = "bg-emerald-600/25 text-emerald-300 border border-emerald-700/40";
  if (s === "rescheduled") bg = "bg-amber-600/25 text-amber-300 border border-amber-700/40";
  if (s === "cancelled") bg = "bg-rose-600/25 text-rose-300 border border-rose-700/40";
  if (s === "completed") bg = "bg-zinc-600/25 text-zinc-200 border border-zinc-700/40";
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${bg}`}>{status}</span>;
}
