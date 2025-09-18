"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

type Appt = {
  id: number;
  business_id: string;
  booking_id: string | null;
  status: "Booked" | "Rescheduled" | "Cancelled" | "Inquiry";
  source: string;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_raw: string | null;
  normalized_service: "ACUTE_30" | "STANDARD_45" | "NEWPATIENT_60" | null;
  start_ts: string;
  end_ts: string | null;
  price_usd: string | null;
};

const ranges = [
  { k: "7", days: 7 },
  { k: "30", days: 30 },
  { k: "90", days: 90 },
  { k: "future", days: 3650 },
];

export default function AppointmentsPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [q, setQ] = useState("");
  const [rangeKey, setRangeKey] = useState("30");
  const [rows, setRows] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const sp = useSearchParams();
  const bizOverride = sp.get("biz") || undefined;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date();
      const r = ranges.find(r => r.k === rangeKey) ?? ranges[1];
      since.setDate(since.getDate() - r.days);

      let query = supabase.from("appointments").select("*").gte("start_ts", since.toISOString());
      if (bizOverride) query = query.eq("business_id", bizOverride);

      const { data } = await query.order("start_ts", { ascending: true }).limit(1000);
      setRows((data ?? []) as Appt[]);
      setLoading(false);
    })();
  }, [rangeKey, bizOverride, supabase]);

  const filtered = rows.filter(r => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    const hay = [
      r.caller_name ?? "",
      r.caller_phone_e164 ?? "",
      r.service_raw ?? "",
      r.normalized_service ?? "",
      r.status,
      r.source,
    ].join(" ").toLowerCase();
    return hay.includes(needle);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <h1 className="text-xl font-semibold">Appointments</h1>
        <div className="flex gap-3">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search name / phone / service"
            className="rounded-xl bg-cx-surface border border-cx-border px-4 py-2 outline-none text-cx-text placeholder:text-cx-muted"
          />
          <select
            value={rangeKey}
            onChange={e => setRangeKey(e.target.value)}
            className="rounded-xl bg-cx-surface border border-cx-border px-3 py-2 outline-none"
          >
            {ranges.map(r => (
              <option key={r.k} value={r.k}>
                {r.k === "future" ? "Future" : `${r.k} days`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl bg-cx-surface border border-cx-border shadow-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-cx-muted">
            <tr className="[&_th]:px-5 [&_th]:py-3 text-left">
              <th>Date</th><th>Time</th><th>Service</th><th>Name</th><th>Phone</th><th>Source</th><th>Status</th><th>Price</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-4 text-cx-muted" colSpan={8}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-5 py-6 text-cx-muted" colSpan={8}>No matching appointments.</td></tr>
            ) : (
              filtered.map(a => (
                <tr key={a.id} className="border-t border-cx-border/70">
                  <td className="px-5 py-3">{new Date(a.start_ts).toLocaleDateString()}</td>
                  <td className="px-5 py-3">{new Date(a.start_ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-5 py-3">{a.normalized_service ?? a.service_raw ?? ""}</td>
                  <td className="px-5 py-3">{a.caller_name ?? ""}</td>
                  <td className="px-5 py-3">{formatPhone(a.caller_phone_e164)}</td>
                  <td className="px-5 py-3">{a.source}</td>
                  <td className="px-5 py-3">{a.status}</td>
                  <td className="px-5 py-3">{a.price_usd ? `$${parseFloat(a.price_usd).toFixed(2)}` : "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPhone(p?: string | null) {
  if (!p) return "";
  const d = p.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return p;
}
