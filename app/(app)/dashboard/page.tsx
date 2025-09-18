"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

type Appt = {
  id: number;
  business_id: string;
  status: "Booked" | "Rescheduled" | "Cancelled" | "Inquiry";
  source: string;
  caller_name: string | null;
  caller_phone_e164: string | null;
  service_raw: string | null;
  normalized_service: "ACUTE_30" | "STANDARD_45" | "NEWPATIENT_60" | null;
  start_ts: string;
  end_ts: string | null;
  received_date: string | null;
  price_usd: string | null;
};

export default function DashboardPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from("appointments")
        .select("*")
        .gte("start_ts", since.toISOString())
        .order("start_ts", { ascending: true })
        .limit(100);
      setAppts((data ?? []) as Appt[]);
      setLoading(false);
    })();
  }, [supabase]);

  const upcoming = appts.filter(a => new Date(a.start_ts) > new Date()).length;
  const booked30 = appts.filter(a => a.status === "Booked").length;
  const revenue = appts.reduce((s, a) => s + (a.price_usd ? parseFloat(a.price_usd) : 0), 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Upcoming" value={loading ? "…" : upcoming.toString()} />
        <Card title="Booked (30d)" value={loading ? "…" : booked30.toString()} />
        <Card title="Revenue (30d)" value={loading ? "…" : `$${revenue.toFixed(2)}`} />
      </div>

      <div className="rounded-2xl bg-cx-surface border border-cx-border shadow-xl">
        <div className="p-5 border-b border-cx-border">
          <h2 className="text-lg font-semibold">Recent Appointments</h2>
          <p className="text-sm text-cx-muted mt-1">RLS scopes by your business.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-cx-muted">
              <tr className="[&_th]:px-5 [&_th]:py-3 text-left">
                <th>Date</th><th>Time</th><th>Service</th><th>Name</th><th>Phone</th><th>Source</th><th>Status</th><th>Price</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-5 py-4 text-cx-muted" colSpan={8}>Loading…</td></tr>
              ) : appts.length === 0 ? (
                <tr><td className="px-5 py-6 text-cx-muted" colSpan={8}>No data yet.</td></tr>
              ) : appts.map(a => (
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-cx-surface border border-cx-border p-5 shadow-xl">
      <div className="text-sm text-cx-muted">{title}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
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
