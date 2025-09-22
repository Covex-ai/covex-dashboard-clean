"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type Row = {
  id: number;
  business_id: string;
  start_ts: string;          // UTC in DB
  end_ts: string | null;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_raw: string | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | "Completed" | null;
};

function startOfMonthLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonthLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
// Sunday-first month grid: 6 rows x 7 cols (42 cells)
function buildMonthGrid(view: Date) {
  const first = startOfMonthLocal(view);
  const start = new Date(first);
  // first.getDay(): 0=Sun..6=Sat ; go back to previous Sunday
  start.setDate(first.getDate() - first.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

// Bounds for the *local* calendar day; send as UTC ISO to DB
function dayBoundsISO(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export default function CalendarPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [view, setView] = useState<Date>(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), 1); // ensure month is local-safe
  });
  const [selected, setSelected] = useState<Date>(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const grid = useMemo(() => buildMonthGrid(view), [view]);
  const monthLabel = view.toLocaleString(undefined, { month: "long", year: "numeric" });

  async function loadDay(d: Date) {
    setBusy(true);
    const { startISO, endISO } = dayBoundsISO(d);
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .gte("start_ts", startISO)
      .lt("start_ts", endISO)
      .order("start_ts", { ascending: true });
    if (!error && data) setRows(data as any);
    setBusy(false);
  }

  useEffect(() => { loadDay(selected); }, [selected]); // load when date changes

  // Realtime: refresh the selected day when any appointment changes
  useEffect(() => {
    const ch = supabase
      .channel("rt-cal")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        loadDay(selected);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selected, supabase]);

  function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }
  function isSameMonth(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  function goPrevMonth() {
    const next = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    setView(next);
    // if selected is outside new month grid, keep the same day number if possible
    setSelected(new Date(next.getFullYear(), next.getMonth(), Math.min(selected.getDate(), 28)));
  }
  function goNextMonth() {
    const next = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    setView(next);
    setSelected(new Date(next.getFullYear(), next.getMonth(), Math.min(selected.getDate(), 28)));
  }
  function goToday() {
    const t = new Date();
    const m1 = new Date(t.getFullYear(), t.getMonth(), 1);
    setView(m1);
    setSelected(new Date(t.getFullYear(), t.getMonth(), t.getDate()));
  }

  // Status badge class
  function statusBadge(s: Row["status"]) {
    if (s === "Cancelled") return "badge badge--cancelled";
    if (s === "Rescheduled") return "badge badge--rescheduled";
    if (s === "Completed") return "badge badge--completed";
    return "badge badge--booked";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{monthLabel}</h1>
        <div className="flex gap-2">
          <button className="btn-pill" onClick={goPrevMonth}>← Prev</button>
          <button className="btn-pill btn-pill--active" onClick={goToday}>Today</button>
          <button className="btn-pill" onClick={goNextMonth}>Next →</button>
        </div>
      </div>

      {/* Month grid */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="grid grid-cols-7 gap-2 text-center text-sm text-cx-muted mb-2">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {grid.map((d, i) => {
            const inMonth = isSameMonth(d, view);
            const sel = isSameDay(d, selected);
            return (
              <button
                key={i}
                onClick={() => setSelected(new Date(d.getFullYear(), d.getMonth(), d.getDate()))}
                className={`rounded-xl h-12 border border-cx-border transition ${
                  sel ? "bg-white/10 text-white" : "bg-cx-bg text-cx-muted hover:text-white hover:bg-white/5"
                } ${inMonth ? "" : "opacity-40"}`}
                title={d.toLocaleDateString()}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day list */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">
            {selected.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" })}
          </div>
          <div className="text-xs flex items-center gap-3 text-cx-muted">
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1"></span>Booked</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1"></span>Rescheduled</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1"></span>Cancelled</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-slate-300 mr-1"></span>Completed</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-cx-muted">
              <tr className="text-left">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = new Date(r.start_ts); // shown in local time
                return (
                  <tr key={r.id} className="border-t border-cx-border">
                    <td className="py-2 pr-4">
                      {t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </td>
                    <td className="py-2 pr-4">{r.caller_name ?? "-"}</td>
                    <td className="py-2 pr-4">{r.caller_phone_e164 ?? "-"}</td>
                    <td className="py-2 pr-4">{r.service_raw ?? "-"}</td>
                    <td className="py-2 pr-4"><span className={statusBadge(r.status)}>{r.status ?? "Booked"}</span></td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-cx-muted" colSpan={5}>
                    {busy ? "Loading…" : "No appointments for this day."}
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
