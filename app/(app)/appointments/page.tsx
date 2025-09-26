"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import {
  normalizeService,
  priceFor as priceForFromNs,
  serviceLabelFor,
} from "@/lib/pricing";

/* ------------------------- types ------------------------- */
type View = "today" | "future" | "all";
type Range = "7d" | "30d" | "90d";
type StatusOpt = "All" | "Booked" | "Rescheduled" | "Cancelled" | "Completed";

type Row = {
  id: number;
  business_id: string;
  start_ts: string;
  end_ts: string | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | "Completed" | null;
  service_raw: string | null;
  normalized_service: string | null;
  price_usd: number | string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_id: number | null;
  address_text: string | null;         // ← NEW: show when is_mobile = true
};

type ServiceRow = {
  id: number;
  name: string;
  code: string | null;
  default_price_usd: number | string;
};

type BizRow = { id: string; is_mobile: boolean };

/* ----------------------- helpers ------------------------- */
function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}
function toNumber(x: unknown, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}
function dayStart(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function dayEnd(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function windowFor(view: View, range: Range) {
  const todayS = dayStart();
  const todayE = dayEnd();

  if (view === "today") return { start: todayS, end: todayE };
  if (view === "future")
    return { start: new Date(todayE.getTime() + 1), end: null as Date | null };

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const start = dayStart(new Date(todayS.getTime() - (days - 1) * 86400000));
  return { start, end: todayE };
}

/* ===================== component ===================== */
export default function AppointmentsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);

  // business context
  const [biz, setBiz] = useState<BizRow | null>(null);

  // UI state
  const [view, setView] = useState<View>("today"); // default
  const [range, setRange] = useState<Range>("7d");
  const [statusFilter, setStatusFilter] = useState<StatusOpt>("All");
  const [q, setQ] = useState("");

  // data
  const [rows, setRows] = useState<Row[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  // map services for quick lookup
  const svcById = useMemo(() => {
    const m = new Map<number, ServiceRow>();
    services.forEach((s) => m.set(s.id, s));
    return m;
  }, [services]);

  // bootstrap business (id + is_mobile), react to realtime toggle
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      // RLS should scope to the signed-in user’s business
      const { data } = await supabase
        .from("businesses")
        .select("id,is_mobile")
        .maybeSingle<BizRow>();
      if (data) setBiz(data);

      // realtime: refresh when the row changes
      if (data?.id) {
        const ch = supabase
          .channel("rt-business-is-mobile")
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "businesses", filter: `id=eq.${data.id}` },
            payload => {
              const rec = payload.new as BizRow;
              setBiz(prev => (prev ? { ...prev, is_mobile: !!rec.is_mobile } : rec));
            }
          )
          .subscribe();

        unsub = () => supabase.removeChannel(ch);
      }
    })();

    return () => { unsub?.(); };
  }, [supabase]);

  // load appointments (+ services) for my business within the window
  async function load() {
    if (!biz?.id) return;
    setLoading(true);

    const { start, end } = windowFor(view, range);

    const [{ data: appts }, { data: svcs }] = await Promise.all([
      (view === "future"
        ? supabase
            .from("appointments")
            .select(
              "id,business_id,start_ts,end_ts,status,service_raw,normalized_service,price_usd,caller_name,caller_phone_e164,service_id,address_text"
            )
            .eq("business_id", biz.id)
            .gte("start_ts", start.toISOString())
            .order("start_ts", { ascending: true })
        : supabase
            .from("appointments")
            .select(
              "id,business_id,start_ts,end_ts,status,service_raw,normalized_service,price_usd,caller_name,caller_phone_e164,service_id,address_text"
            )
            .eq("business_id", biz.id)
            .gte("start_ts", start.toISOString())
            .lte("start_ts", end!.toISOString())
            .order("start_ts", { ascending: true })
      ),
      supabase
        .from("services")
        .select("id,name,code,default_price_usd")
        .eq("business_id", biz.id)
        .order("active", { ascending: false })
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
    ]);

    setRows((appts as any) ?? []);
    setServices((svcs as any) ?? []);
    setLoading(false);
  }

  // load when ready + when window changes
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz?.id, view, range]);

  // realtime – only my business’ rows
  useEffect(() => {
    if (!biz?.id) return;
    const ch = supabase
      .channel("rt-appointments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `business_id=eq.${biz.id}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz?.id]);

  // client-side filter
  const filtered = rows.filter((r) => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    if (q.trim()) {
      const hay = `${r.caller_name ?? ""} ${r.caller_phone_e164 ?? ""} ${r.service_raw ?? ""} ${r.address_text ?? ""}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  // price consistency with Overview
  function priceForRow(r: Row): number {
    if ((r.status ?? "").toLowerCase() === "cancelled") return 0;

    // explicit price wins if valid
    const explicit = toNumber(r.price_usd, NaN);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;

    // else service default
    if (r.service_id != null) {
      const svc = svcById.get(r.service_id);
      if (svc) return toNumber(svc.default_price_usd, 0);
    }

    // else normalized fallback
    const ns = (r.normalized_service as any) ?? normalizeService(r.service_raw);
    return priceForFromNs(ns, toNumber(r.price_usd, 0));
  }

  // styling so only ONE group looks active
  const rangeEnabled = view === "all";
  const rangeBtnClass = (r: Range) =>
    `btn-pill ${rangeEnabled && range === r ? "btn-pill--active" : ""} ${
      !rangeEnabled ? "opacity-50 cursor-not-allowed" : ""
    }`;

  const showAddress = !!biz?.is_mobile;

  return (
    <div className="space-y-4">
      {/* Top bar */}
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

          {/* Range pills only "active" in All view */}
          <button
            type="button"
            className={rangeBtnClass("7d")}
            onClick={() => rangeEnabled && setRange("7d")}
            aria-disabled={!rangeEnabled}
            title={rangeEnabled ? "Show last 7 days" : "Switch to All to use ranges"}
          >
            7d
          </button>
          <button
            type="button"
            className={rangeBtnClass("30d")}
            onClick={() => rangeEnabled && setRange("30d")}
            aria-disabled={!rangeEnabled}
            title={rangeEnabled ? "Show last 30 days" : "Switch to All to use ranges"}
          >
            30d
          </button>
          <button
            type="button"
            className={rangeBtnClass("90d")}
            onClick={() => rangeEnabled && setRange("90d")}
            aria-disabled={!rangeEnabled}
            title={rangeEnabled ? "Show last 90 days" : "Switch to All to use ranges"}
          >
            90d
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusOpt)}
            className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none [color-scheme:dark]"
          >
            {["All", "Booked", "Rescheduled", "Cancelled", "Completed"].map((s) => (
              <option key={s} value={s} className="text-black bg-white">
                {s}
              </option>
            ))}
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, service, address"
            className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none w-64"
          />

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
              {showAddress && <th className="py-3 pr-4">Address</th>}
              <th className="py-3 pr-4">Status</th>
              <th className="py-3 pr-4">Price</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              // label: prefer service name if service_id is set
              let svcLabel = r.service_raw || r.normalized_service || "Service";
              if (r.service_id != null) {
                const svc = svcById.get(r.service_id);
                if (svc?.name) svcLabel = svc.name;
              } else {
                const ns = (r.normalized_service as any) ?? normalizeService(r.service_raw);
                svcLabel = serviceLabelFor(ns, r.service_raw) || svcLabel;
              }

              const d = new Date(r.start_ts);
              const date = d.toLocaleDateString();
              const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

              return (
                <tr key={r.id} className="border-t border-cx-border">
                  <td className="py-2 pl-4 pr-4">{date}</td>
                  <td className="py-2 pr-4">{time}</td>
                  <td className="py-2 pr-4">{svcLabel}</td>
                  <td className="py-2 pr-4">{r.caller_name ?? "-"}</td>
                  <td className="py-2 pr-4">{r.caller_phone_e164 ?? "-"}</td>
                  {showAddress && <td className="py-2 pr-4">{r.address_text ?? "—"}</td>}
                  <td className="py-2 pr-4">
                    <StatusBadge status={r.status ?? "Booked"} />
                  </td>
                  <td className="py-2 pr-4">{fmtUSD(priceForRow(r))}</td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={showAddress ? 8 : 7} className="py-8 text-center text-cx-muted">
                  No results.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={showAddress ? 8 : 7} className="py-8 text-center text-cx-muted">
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
