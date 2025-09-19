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
type View = "Today" | "Future" | "All";

type ApptRow = {
  id: number;
  start_ts: string;
  end_ts: string | null;
  name: string | null;
  phone: string | null;
  status: string | null; // raw; we normalize below
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

function isCompleted(row: ApptRow): boolean {
  // Consider as completed if:
  // 1) status is explicitly "Completed", OR
  // 2) appointment start time is in the past AND not Cancelled.
  const st = normalizeStatus(row.status);
  const past = new Date(row.start_ts).getTime() < Date.now();
  return st === "Completed" || (past && st !== "Cancelled");
}

function StatusBadge({ value }: { value: Status | null }) {
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
  const [view, setView] = useState<View>("Today"); // <- default = Today
  const [range, setRange] = useState<Range>("30d");
  const [status, setStatus] = useState<Status>("All");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ApptRow[]>([]);

  function daysFor(r: Range) {
    return r === "7d" ? 7 : r === "30d" ? 30 : 90;
  }

  function startOfToday() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function endOfToday() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
  }

  async function load() {
    // Always fetch a reasonable window, then filter client-side for view/status/search.
    const baseDays = daysFor(range);
    const from = new Date();
    from.setDate(from.getDate() - baseDays);

    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .gte("start_ts", from.toISOString())
      .order("start_ts", { ascending: false });

    if (error) return;

    const all = (data as unknown as ApptRow[]) ?? [];

    // 1) Filter by VIEW
    const sToday = startOfToday().getTime();
    const eToday = endOfToday().getTime();
    let byView: ApptRow[] = all;

    if (view === "Today") {
      byView = all.filter((r) => {
        const t = new Date(r.start_ts).getTime();
        return t >= sToday && t <= eToday;
      });
    } else if (view === "Future") {
      byView = all.filter((r) => {
        const t = new Date(r.start_ts).getTime();
        return t > eToday;
      });
    } // "All" just uses the base window

    // 2) Filter by STATUS (robust)
    let byStatus: ApptRow[];
    if (status === "All") {
      byStatus = byView;
    } else if (status === "Completed") {
      byStatus = byView.filter(isCompleted);
    } else {
      byStatus = byView.filter((r) => normalizeStatus(r.status) === status);
    }

    // 3) Search filter
    const final = q.trim()
      ? byStatus.filter((r) => {
          const hay = `${r.name ?? ""} ${r.phone ?? ""} ${r.service_raw ?? ""}`.toLowerCase();
          return hay.includes(q.toLowerCase());
        })
      : byStatus;

    setRows(final);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, range, status, q]);

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
          {/* New view tabs */}
          <div className="flex gap-2">
            {(["Today","Future","All"] as View[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`btn-pill ${view === v ? "btn-pill--active" : ""}`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Keep range pills (used when View=All; harmless otherwise) */}
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
                  <td className="py-2 pr-4">{r.name ?? "—"}</td>
                  <td className="py-2 pr-4">{r.phone ?? "—"}</td>
                  <td className="py-2 pr-4"><StatusBadge value={st} /></td>
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
