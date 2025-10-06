"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import {
  normalizeService,
  priceFor as priceForFromNs,
  serviceLabelFor,
} from "@/lib/pricing";

type View = "today" | "future" | "all";
type Range = "7d" | "30d" | "90d";
type StatusOpt = "All" | "Booked" | "Rescheduled" | "Cancelled" | "Completed" | "Inquiry";

type Row = {
  id: number;
  start_ts: string;
  end_ts: string | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | "Completed" | "Inquiry" | null;
  service_raw: string | null;
  normalized_service: string | null;
  price_usd: number | string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_id: number | null;
};

type ServiceRow = {
  id: number;
  name: string;
  code: string | null;
  default_price_usd: number | string;
};

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
}
function toNumber(x: unknown, fallback = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}
function dayStart(d = new Date()) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function dayEnd(d = new Date()) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function windowFor(view: View, range: Range) {
  const todayS = dayStart(); const todayE = dayEnd();
  if (view === "today") return { start: todayS, end: todayE };
  if (view === "future") return { start: new Date(todayE.getTime() + 1), end: null as Date | null };
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const start = dayStart(new Date(todayS.getTime() - (days - 1) * 86400000));
  return { start, end: todayE };
}

export default function AppointmentsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [bizId, setBizId] = useState<string | null>(null);

  const [view, setView] = useState<View>("today");
  const [range, setRange] = useState<Range>("7d");
  const [statusFilter, setStatusFilter] = useState<StatusOpt>("All");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<Row[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const svcById = useMemo(() => {
    const m = new Map<number, ServiceRow>();
    services.forEach((s) => m.set(s.id, s));
    return m;
  }, [services]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("business_id").maybeSingle();
      setBizId(data?.business_id ?? null);
    })();
  }, [supabase]);

  async function load() {
    if (!bizId) return;
    setLoading(true);

    const { start, end } = windowFor(view, range);

    const [{ data: appts }, { data: svcs }] = await Promise.all([
      (view === "future"
        ? supabase
            .from("appointments")
            .select("id,start_ts,end_ts,status,service_raw,normalized_service,price_usd,caller_name,caller_phone_e164,service_id")
            .eq("business_id", bizId)
            .gte("start_ts", start.toISOString())
            .order("start_ts", { ascending: true })
        : supabase
            .from("appointments")
            .select("id,start_ts,end_ts,status,service_raw,normalized_service,price_usd,caller_name,caller_phone_e164,service_id")
            .eq("business_id", bizId)
            .gte("start_ts", start.toISOString())
            .lte("start_ts", end!.toISOString())
            .order("start_ts", { ascending: true })),
      supabase
        .from("services")
        .select("id,name,code,default_price_usd")
        .eq("business_id", bizId)
        .order("active", { ascending: false })
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),
    ]);

    setRows((appts as any) ?? []);
    setServices((svcs as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [bizId, view, range]);

  useEffect(() => {
    if (!bizId) return;
    const ch = supabase
      .channel("rt-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `business_id=eq.${bizId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizId]);

  const filtered = rows.filter((r) => {
    if (statusFilter !== "All" && r.status !== statusFilter) return false;
    if (q.trim()) {
      const hay = `${r.caller_name ?? ""} ${r.caller_phone_e164 ?? ""} ${r.service_raw ?? ""}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  function priceForRow(r: Row): number {
    const s = (r.status ?? "").toLowerCase();
    if (s === "cancelled" || s === "inquiry") return 0; // never count inquiries
    const explicit = toNumber(r.price_usd, NaN);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    if (r.service_id != null) {
      const svc = svcById.get(r.service_id);
      if (svc) return toNumber(svc.default_price_usd, 0);
    }
    const ns = (r.normalized_service as any) ?? normalizeService(r.service_raw);
    return priceForFromNs(ns, toNumber(r.price_usd, 0));
  }

  const rangeEnabled = view === "all";
  const rangeBtnClass = (r: Range) =>
    `btn-pill ${rangeEnabled && range === r ? "btn-pill--active" : ""} ${!rangeEnabled ? "opacity-50 cursor-not-allowed" : ""}`;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" className={`btn-pill ${view === "today" ? "btn-pill--active" : ""}`} onClick={() => setView("today")}>Today</button>
          <button type="button" className={`btn-pill ${view === "future" ? "btn-pill--active" : ""}`} onClick={() => setView("future")}>Future</button>
          <button type="button" className={`btn-pill ${view === "all" ? "btn-pill--active" : ""}`} onClick={() => setView("all")}>All</button>

          <button type="button" className={rangeBtnClass("7d")}  onClick={() => rangeEnabled && setRange("7d")}  aria-disabled={!rangeEnabled}>7d</button>
          <button type="button" className={rangeBtnClass("30d")} onClick={() => rangeEnabled && setRange("30d")} aria-disabled={!rangeEnabled}>30d</button>
          <button type="button" className={rangeBtnClass("90d")} onClick={() => rangeEnabled && setRange("90d")} aria-disabled={!rangeEnabled}>90d</button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusOpt)}
            className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none [color-scheme:dark]"
          >
            {["All","Booked","Rescheduled","Cancelled","Completed","Inquiry"].map((s) => (
              <option key={s} value={s} className="text-black bg-white">{s}</option>
            ))}
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, service"
            className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none w-64"
          />

          <Link href="/appointments/new" className="btn-pill btn-pill--active">+ New</Link>
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
              <th className="py-3 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              let svcLabel = r.service_raw || r.normalized_service || "—";
              if (!svcLabel) {
                const ns = (r.normalized_service as any) ?? normalizeService(r.service_raw);
                svcLabel = serviceLabelFor(ns, r.service_raw) || "—";
              }
              const d = new Date(r.start_ts);
              const date = d.toLocaleDateString();
              const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
              const isInquiry = (r.status ?? "").toLowerCase() === "inquiry";

              return (
                <tr key={r.id} className="border-t border-cx-border">
                  <td className="py-2 pl-4 pr-4">{date}</td>
                  <td className="py-2 pr-4">{time}</td>
                  <td className="py-2 pr-4">{svcLabel}</td>
                  <td className="py-2 pr-4">{r.caller_name ?? "-"}</td>
                  <td className="py-2 pr-4">{r.caller_phone_e164 ?? "-"}</td>
                  <td className="py-2 pr-4"><StatusBadge status={r.status ?? "Booked"} /></td>
                  <td className="py-2 pr-4">{fmtUSD(priceForRow(r))}</td>
                  <td className="py-2 pr-4">
                    {isInquiry && (
                      <Link
                        className="px-2 py-1 rounded-xl text-xs font-medium bg-sky-600/20 text-sky-300 border border-sky-700/40"
                        href={{
                          pathname: "/appointments/new",
                          query: {
                            name: r.caller_name ?? "",
                            phone: (r.caller_phone_e164 ?? "").replace(/^\+1/, ""), // prefill US local
                          },
                        }}
                      >
                        Book →
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-cx-muted">No results.</td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-cx-muted">Loading…</td>
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
  let cls = "bg-white/10 text-white";
  if (s === "booked")      cls = "bg-emerald-600/25 text-emerald-300 border border-emerald-700/40";
  if (s === "rescheduled") cls = "bg-amber-600/25 text-amber-300 border border-amber-700/40";
  if (s === "cancelled")   cls = "bg-rose-600/25 text-rose-300 border border-rose-700/40";
  if (s === "completed")   cls = "bg-zinc-600/25 text-zinc-200 border border-zinc-700/40";
  if (s === "inquiry")     cls = "bg-sky-600/25 text-sky-300 border border-sky-700/40";
  return <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}
