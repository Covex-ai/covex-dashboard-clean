"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type Appt = {
  id: number;
  start_ts: string; // ISO
  end_ts: string | null;
  status: string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_raw: string | null;
  normalized_service: string | null;
  price_usd: number | string | null;
  address_text: string | null;
};

type Biz = { is_mobile: boolean };

type Tab = "today" | "future" | "past";
type StatusFilter = "All" | "Booked" | "Rescheduled" | "Cancelled" | "Completed";

// how far back “Past” goes
const PAST_DAYS = 30;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function isoAtStartOfToday() {
  return startOfToday().toISOString();
}
function isoAtStartOfTomorrow() {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}
function isoDaysAgoStart(n: number) {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export default function AppointmentsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [tab, setTab] = useState<Tab>("today"); // default Today
  const [isMobile, setIsMobile] = useState(false);
  const [rows, setRows] = useState<Appt[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  async function loadBiz() {
    const { data } = await supabase.from("businesses").select("is_mobile").single();
    setIsMobile(Boolean((data as Biz)?.is_mobile));
  }

  async function loadAppts() {
    const todayISO = isoAtStartOfToday();
    const tomorrowISO = isoAtStartOfTomorrow();
    const pastStartISO = isoDaysAgoStart(PAST_DAYS);

    let q = supabase
      .from("appointments")
      .select("id,start_ts,end_ts,status,caller_name,caller_phone_e164,service_raw,normalized_service,price_usd,address_text");

    if (tab === "today") {
      // >= today 00:00 and < tomorrow 00:00
      q = q.gte("start_ts", todayISO).lt("start_ts", tomorrowISO).order("start_ts", { ascending: true });
    } else if (tab === "future") {
      // future: >= tomorrow 00:00
      q = q.gte("start_ts", tomorrowISO).order("start_ts", { ascending: true });
    } else {
      // past: last PAST_DAYS days before today
      q = q.gte("start_ts", pastStartISO).lt("start_ts", todayISO).order("start_ts", { ascending: false });
    }

    const { data } = await q;
    setRows((data as any) ?? []);
  }

  useEffect(() => {
    loadBiz();
  }, []);
  useEffect(() => {
    loadAppts();
  }, [tab]);

  // Realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel("rt-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => loadAppts())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tab]);

  function StatusPill({ s }: { s: string | null }) {
    const v = (s ?? "").toLowerCase();
    const base = "px-2 py-1 rounded-lg text-xs font-medium border border-cx-border";
    if (v === "booked") return <span className={`${base} text-emerald-400`}>Booked</span>;
    if (v === "rescheduled") return <span className={`${base} text-amber-300`}>Rescheduled</span>;
    if (v === "cancelled") return <span className={`${base} text-rose-400`}>Cancelled</span>;
    if (v === "completed") return <span className={`${base} text-zinc-300`}>Completed</span>;
    return <span className={`${base} text-cx-muted`}>{s ?? "-"}</span>;
  }

  // client-side status filter
  const filtered = useMemo(() => {
    if (statusFilter === "All") return rows;
    const want = statusFilter.toLowerCase();
    return rows.filter(r => (r.status ?? "").toLowerCase() === want);
  }, [rows, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Tabs + Status filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("today")}
            className={`btn-pill ${tab === "today" ? "btn-pill--active" : ""}`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setTab("future")}
            className={`btn-pill ${tab === "future" ? "btn-pill--active" : ""}`}
          >
            Future
          </button>
          <button
            type="button"
            onClick={() => setTab("past")}
            className={`btn-pill ${tab === "past" ? "btn-pill--active" : ""}`}
          >
            Past {PAST_DAYS}d
          </button>
        </div>

        {/* Status filter (dark, readable) */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-cx-muted text-sm">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="btn-pill bg-white/5 text-white [color-scheme:dark]"
            title="Filter by status"
          >
            {(["All","Booked","Rescheduled","Cancelled","Completed"] as const).map(s => (
              <option key={s} value={s} className="text-black bg-white">{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h3 className="font-semibold mb-3">
          {tab === "today" ? "Today’s appointments" : tab === "future" ? "Upcoming appointments" : `Past ${PAST_DAYS} days`}
        </h3>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-cx-muted">
              <tr className="text-left">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Phone</th>
                {isMobile && <th className="py-2 pr-4">Address</th>}
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const d = new Date(r.start_ts);
                const date = d.toLocaleDateString();
                const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                const svc = r.service_raw || r.normalized_service || "—";

                return (
                  <tr key={r.id} className="border-t border-cx-border">
                    <td className="py-2 pr-4">{date}</td>
                    <td className="py-2 pr-4">{time}</td>
                    <td className="py-2 pr-4">{r.caller_name ?? "—"}</td>
                    <td className="py-2 pr-4">{r.caller_phone_e164 ?? "—"}</td>
                    {isMobile && <td className="py-2 pr-4">{r.address_text ?? "—"}</td>}
                    <td className="py-2 pr-4">{svc}</td>
                    <td className="py-2 pr-4">
                      <StatusPill s={r.status} />
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-cx-muted" colSpan={isMobile ? 7 : 6}>
                    {tab === "today"
                      ? "No appointments today."
                      : tab === "future"
                      ? "No upcoming appointments."
                      : `No appointments in the past ${PAST_DAYS} days.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
