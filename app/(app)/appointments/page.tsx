"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";
import RangePills from "@/components/RangePills";
import { fmtUSD, normalizeService, priceFor, serviceLabelFor, toNumber, type NormalizedService } from "@/lib/pricing";

type Range = "7d" | "30d" | "90d";
type Status = "All" | "Booked" | "Rescheduled" | "Cancelled" | "Completed";

type ApptRow = {
  id: number;
  start_ts: string;
  end_ts: string | null;
  name: string | null;
  phone: string | null;
  status: Status | null;
  service_raw: string | null;
  normalized_service: NormalizedService | null;
  price_usd: number | string | null;
};

export default function AppointmentsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [range, setRange] = useState<Range>("30d");
  const [status, setStatus] = useState<Status>("All");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ApptRow[]>([]);

  function daysFor(r: Range) { return r === "7d" ? 7 : r === "30d" ? 30 : 90; }

  async function load() {
    const days = daysFor(range);
    const from = new Date();
    from.setDate(from.getDate() - days);

    let query = supabase
      .from("appointments")
      .select("*")
      .gte("start_ts", from.toISOString())
      .order("start_ts", { ascending: false });

    if (status !== "All") query = query.eq("status", status);

    const { data, error } = await query;
    if (!error && data) {
      const all = data as unknown as ApptRow[];
      const filtered = q.trim()
        ? all.filter((r) => {
            const hay = `${r.name ?? ""} ${r.phone ?? ""} ${r.service_raw ?? ""}`.toLowerCase();
            return hay.includes(q.toLowerCase());
          })
        : all;
      setRows(filtered);
    }
  }

  useEffect(() => { load(); }, [range, status, q]);

  useEffect(() => {
    const ch = supabase
      .channel("rt-appointments")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, (_p) => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex gap-2">
          <RangePills value={range} onChange={setRange} />
          <select
            className="btn-pill bg-white/5"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
          >
            {["All","Booked","Rescheduled","Cancelled","Completed"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, service"
          className="px-3 py-2 rounded-xl bg-cx-surface border border-cx-border text-sm outline-none"
        />
      </div>

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
              return (
                <tr key={r.id} className="border-t border-cx-border">
                  <td className="py-2 pr-4">{new Date(r.start_ts).toLocaleDateString()}</td>
                  <td className="py-2 pr-4">{new Date(r.start_ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
                  <td className="py-2 pr-4">{serviceLabelFor(ns, r.service_raw)}</td>
                  <td className="py-2 pr-4">{r.name ?? "-"}</td>
                  <td className="py-2 pr-4">{r.phone ?? "-"}</td>
                  <td className="py-2 pr-4">{r.status ?? "-"}</td>
                  <td className="py-2 pr-4">{fmtUSD(priceFor(ns, toNumber(r.price_usd)))}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="py-6 text-center text-cx-muted" colSpan={7}>No results.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
