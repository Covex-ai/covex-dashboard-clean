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

type Tab = "today" | "future";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.toISOString();
}
function startOfTomorrowISO() {
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export default function AppointmentsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [tab, setTab] = useState<Tab>("today"); // default Today
  const [isMobile, setIsMobile] = useState(false);
  const [rows, setRows] = useState<Appt[]>([]);

  async function loadBiz() {
    const { data } = await supabase.from("businesses").select("is_mobile").single();
    setIsMobile(Boolean((data as Biz)?.is_mobile));
  }

  async function loadAppts() {
    const today = startOfTodayISO();
    const tomorrow = startOfTomorrowISO();

    let q = supabase
      .from("appointments")
      .select("id,start_ts,end_ts,status,caller_name,caller_phone_e164,service_raw,normalized_service,price_usd,address_text")
      .order("start_ts", { ascending: true });

    if (tab === "today") {
      // >= today 00:00 and < tomorrow 00:00
      q = q.gte("start_ts", today).lt("start_ts", tomorrow);
    } else {
      // future: >= tomorrow 00:00
      q = q.gte("start_ts", tomorrow);
    }

    const { data } = await q;
    setRows((data as any) ?? []);
  }

  useEffect(() => { loadBiz(); }, []);
  useEffect(() => { loadAppts(); }, [tab]);

  // Realtime refresh
  useEffect(() => {
    const ch = supabase
      .channel("rt-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => loadAppts())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={()=>setTab("today")}
          className={`btn-pill ${tab === "today" ? "btn-pill--active" : ""}`}
        >
          Today
        </button>
        <button
          type="button"
          onClick={()=>setTab("future")}
          className={`btn-pill ${tab === "future" ? "btn-pill--active" : ""}`}
        >
          Future
        </button>
      </div>

      {/* Table */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h3 className="font-semibold mb-3">
          {tab === "today" ? "Today’s appointments" : "Upcoming appointments"}
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
              {rows.map((r) => {
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
                    <td className="py-2 pr-4"><StatusPill s={r.status} /></td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-cx-muted" colSpan={isMobile ? 7 : 6}>
                    {tab === "today" ? "No appointments today." : "No upcoming appointments."}
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
