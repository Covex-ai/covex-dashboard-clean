"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type Biz = { is_mobile: boolean };

type Appt = {
  id: number;
  start_ts: string;
  end_ts: string | null;
  status: string | null; // 'Booked' | 'Rescheduled' | 'Cancelled' | 'Completed'
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_raw: string | null;
  normalized_service: string | null;
  address_text: string | null;
};

type DayEvent = {
  id: number;
  time: string; // e.g. "3:30 PM"
  name: string;
  phone: string;
  service: string;
  status: string;
  address?: string | null;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function startOfMonth(d = new Date()) {
  const x = new Date(d);
  x.setDate(1); x.setHours(0,0,0,0);
  return x;
}
function endOfMonth(d = new Date()) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + 1, 0); // last day of month
  x.setHours(23,59,59,999);
  return x;
}
function startOfCalendarGrid(d: Date) {
  const first = startOfMonth(d);
  const day = first.getDay(); // 0=Sun
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - day);
  gridStart.setHours(0,0,0,0);
  return gridStart;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtTime(dt: Date) {
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function StatusDot({ s }: { s: string | null }) {
  const v = (s ?? "").toLowerCase();
  const base = "inline-block w-2 h-2 rounded-full";
  if (v === "booked") return <span className={`${base}`} style={{ background: "#34d399" }} />;
  if (v === "rescheduled") return <span className={`${base}`} style={{ background: "#fbbf24" }} />;
  if (v === "cancelled") return <span className={`${base}`} style={{ background: "#f43f5e" }} />;
  if (v === "completed") return <span className={`${base}`} style={{ background: "#d4d4d8" }} />;
  return <span className={`${base}`} style={{ background: "#9aa2b1" }} />;
}

function StatusPill({ s }: { s: string | null }) {
  const v = (s ?? "").toLowerCase();
  const base = "px-2 py-1 rounded-lg text-xs font-medium border border-cx-border";
  if (v === "booked") return <span className={`${base} text-emerald-400`}>Booked</span>;
  if (v === "rescheduled") return <span className={`${base} text-amber-300`}>Rescheduled</span>;
  if (v === "cancelled") return <span className={`${base} text-rose-400`}>Cancelled</span>;
  if (v === "completed") return <span className={`${base} text-zinc-300`}>Completed</span>;
  return <span className={`${base} text-cx-muted`}>{s ?? "-"}</span>;
}

export default function CalendarPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date())); // which month we’re looking at
  const [isMobile, setIsMobile] = useState(false);
  const [byDay, setByDay] = useState<Record<string, DayEvent[]>>({});
  const [selectedDay, setSelectedDay] = useState<string>(() => ymd(new Date()));

  async function loadBiz() {
    const { data } = await supabase.from("businesses").select("is_mobile").single();
    setIsMobile(Boolean((data as Biz)?.is_mobile));
  }

  async function loadAppts(month: Date) {
    const gridStart = startOfCalendarGrid(month);
    const gridEnd = addDays(gridStart, 42); // 6 weeks view
    const { data } = await supabase
      .from("appointments")
      .select("id,start_ts,status,caller_name,caller_phone_e164,service_raw,normalized_service,address_text")
      .gte("start_ts", gridStart.toISOString())
      .lt("start_ts", gridEnd.toISOString())
      .order("start_ts", { ascending: true });

    const map: Record<string, DayEvent[]> = {};
    for (const r of (data as Appt[] | null) ?? []) {
      const dt = new Date(r.start_ts);
      const key = ymd(dt);
      const ev: DayEvent = {
        id: r.id,
        time: fmtTime(dt),
        name: r.caller_name ?? "—",
        phone: r.caller_phone_e164 ?? "—",
        service: r.service_raw || r.normalized_service || "—",
        status: r.status ?? "-",
        address: r.address_text ?? null,
      };
      (map[key] ||= []).push(ev);
    }
    setByDay(map);

    // Keep selection sane: if selected not in this 6-week grid, set to first of month
    const firstOfMonth = ymd(startOfMonth(month));
    if (!map[selectedDay]) setSelectedDay(firstOfMonth);
  }

  useEffect(() => { loadBiz(); }, []);
  useEffect(() => { loadAppts(cursor); }, [cursor]);

  // Realtime refresh if anything changes
  useEffect(() => {
    const ch = supabase
      .channel("rt-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => loadAppts(cursor))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cursor]);

  // Build 6-week grid
  const gridStart = startOfCalendarGrid(cursor);
  const days: Date[] = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const monthIndex = cursor.getMonth();

  function gotoToday() {
    const t = new Date();
    setCursor(startOfMonth(t));
    setSelectedDay(ymd(t));
  }
  function prevMonth() {
    const x = new Date(cursor);
    x.setMonth(x.getMonth() - 1, 1);
    setCursor(startOfMonth(x));
  }
  function nextMonth() {
    const x = new Date(cursor);
    x.setMonth(x.getMonth() + 1, 1);
    setCursor(startOfMonth(x));
  }

  const selectedEvents = byDay[selectedDay] || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">
          {cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-pill" onClick={prevMonth}>← Prev</button>
          <button className="btn-pill" onClick={gotoToday}>Today</button>
          <button className="btn-pill" onClick={nextMonth}>Next →</button>
        </div>
      </div>

      {/* Month grid */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-2 text-xs text-cx-muted mb-2 px-1">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="text-center">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((d) => {
            const key = ymd(d);
            const inMonth = d.getMonth() === monthIndex;
            const isSelected = key === selectedDay;
            const events = byDay[key] || [];
            const counts = {
              booked: events.filter(e => e.status.toLowerCase() === "booked").length,
              rescheduled: events.filter(e => e.status.toLowerCase() === "rescheduled").length,
              cancelled: events.filter(e => e.status.toLowerCase() === "cancelled").length,
              completed: events.filter(e => e.status.toLowerCase() === "completed").length,
            };

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(key)}
                className={`text-left rounded-xl border px-2 py-2 transition
                  ${isSelected ? "border-white bg-white/10" : "border-cx-border bg-cx-bg hover:bg-white/5"}
                  ${inMonth ? "opacity-100" : "opacity-60"}`}
                title={`${events.length} appointments`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-cx-muted">{d.getDate()}</span>
                  {/* tiny status dots if any */}
                  <div className="flex items-center gap-1">
                    {counts.booked > 0 && <StatusDot s="Booked" />}
                    {counts.rescheduled > 0 && <StatusDot s="Rescheduled" />}
                    {counts.cancelled > 0 && <StatusDot s="Cancelled" />}
                    {counts.completed > 0 && <StatusDot s="Completed" />}
                  </div>
                </div>
                {events.length > 0 && (
                  <div className="text-xs text-cx-muted">{events.length} appt{events.length > 1 ? "s" : ""}</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day list */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            {new Date(selectedDay).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
          </h3>
          <div className="flex items-center gap-3 text-xs text-cx-muted">
            <div className="flex items-center gap-1"><StatusDot s="Booked" />Booked</div>
            <div className="flex items-center gap-1"><StatusDot s="Rescheduled" />Rescheduled</div>
            <div className="flex items-center gap-1"><StatusDot s="Cancelled" />Cancelled</div>
            <div className="flex items-center gap-1"><StatusDot s="Completed" />Completed</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-cx-muted">
              <tr className="text-left">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Phone</th>
                {isMobile && <th className="py-2 pr-4">Address</th>}
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {selectedEvents.map((e) => (
                <tr key={e.id} className="border-t border-cx-border">
                  <td className="py-2 pr-4">{e.time}</td>
                  <td className="py-2 pr-4">{e.name}</td>
                  <td className="py-2 pr-4">{e.phone}</td>
                  {isMobile && <td className="py-2 pr-4">{e.address ?? "—"}</td>}
                  <td className="py-2 pr-4">{e.service}</td>
                  <td className="py-2 pr-4"><StatusPill s={e.status} /></td>
                </tr>
              ))}
              {selectedEvents.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-cx-muted" colSpan={isMobile ? 6 : 5}>
                    No appointments for this day.
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
