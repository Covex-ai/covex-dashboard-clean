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
  start_ts: string | null;
  end_ts: string | null;
  created_at?: string | null;
  name: string | null;
  phone: string | null;
  caller_name?: string | null;
  caller_phone_e164?: string | null;
  status: string | null;
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

function bestWhen(row: ApptRow): Date | null {
  const a = row.start_ts ? new Date(row.start_ts) : null;
  const b = row.end_ts ? new Date(row.end_ts) : null;
  const c = row.created_at ? new Date(row.created_at) : null;
  return a ?? b ?? c ?? null;
}

function isCompleted(row: ApptRow): boolean {
  const st = normalizeStatus(row.status);
  if (st === "Cancelled") return false;
  if (st === "Completed") return true;
  const when = bestWhen(row);
  return !!when && when.getTime() < Date.now();
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
  const [view, setView] = useState<View>("Today"); // default tab
  const [range, setRange] = useState<Range>("30d"); // only used when view==="All"
  const [status, setStatus] = useState<Status>("All");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ApptRow[]>([]);

  function daysFor(r: Range) {
    return r === "7d" ? 7 : r === "30d" ? 30 : 90;
  }
  const startOfToday = () => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  };
  const endOfToday = () => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 23, 59, 59, 999);
  };

  async function load() {
    // Fetch a reasonable window; filter client-side for view/status/search
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

    // 1) View filter
    const sToday = startOfToday().getTime();
    const eToday = endOfToday().getTime();
    let byView: ApptRow[] = all;

    if (view === "Today") {
      byView = all.filter((r) => {
        const when = bestWhen(r);
        if (!when) return false;
        const t = when.getTime();
        return t >= sToday && t <= eToday;
      });
    } else if (view === "Future") {
      byView = all.filter((r) => {
        const when = bestWhen(r);
        if (!when) return false;
        return when.getTime() > eToday;
      });
    }
    // view === "All" -> keep base window

    // 2) Status filter
    let byStatus: ApptRow[];
    if (status === "All") byStatus = byView;
    else if (status === "Completed") byStatus = byView.filter(isCompleted);
    else byStatus = byView.filter((r) => normalizeStatus(r.status) === status);

    // 3) Search (supports caller_* columns)
    const final = q.trim()
      ? byStatus.filter((r) => {
          const name = r.name ?? r.caller_name ?? "";
          const phone = r.phone ?? r.caller_phone_e164 ?? "";
          const hay = `${name} ${phone} ${r.service_raw ?? ""}`.toLowerCase();
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
        <div className="flex flex-wrap gap-2">
          {/* View tabs */}
          {(["Today", "Future", "All"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`btn-pill ${view === v ? "btn-pill--active" : ""}`}
            >
              {v}
            </button>
          ))}

          {/* Range pills only when on All (so you never see two “actives” at once) */}
          {view === "All" && <RangePills value={range} onChange={setRange} />}

          {/* Legible native select */}
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
              const st = normalizeStatus(r.status) ?? (isCompleted(r) ? "Completed" : null);
              const when = bestWhen(r);
              const name = r.name ?? r.caller_name ?? "—";
              const phone = r.phone ?? r.caller_phone_e164 ?? "—";

              return (
                <tr key={r.id} className="border-t border-cx-border">
                  <td className="py-2 pr-4">{when ? when.toLocaleDateString() : "—"}</td>
                  <td className="py-2 pr-4">
                    {when ? when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}
                  </td>
                  <td className="py-2 pr-4">{serviceLabelFor(ns, r.service_raw)}</td>
                  <td className="py-2 pr-4">{name}</td>
                  <td className="py-2 pr-4">{phone}</td>
                  <td className="py-2 pr-4"><StatusBadge value={st} /></td>
                  <td className="py-2 pr-4">{fmtUSD(priceFor(ns, toNumber(r.price_usd)))}</td>
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
