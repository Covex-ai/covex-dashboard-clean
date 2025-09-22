"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type Service = {
  id: number;
  name: string;
  active?: boolean;
  default_price_cents?: number | null;
  event_type_id?: number | null;    // Cal.com Event Type ID  ← tweak if your column is named differently
  duration_min?: number | null;     // service length in minutes ← tweak if your column is named differently
};

type Slot = string; // ISO UTC, e.g. "2025-09-22T14:00:00Z"

function addMinutes(isoUTC: string, mins: number) {
  const d = new Date(isoUTC);
  d.setUTCMinutes(d.getUTCMinutes() + mins);
  return d.toISOString();
}

export default function NewAppointmentPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [services, setServices] = useState<Service[]>([]);
  const [svcId, setSvcId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });
  const [tz, setTz] = useState("America/New_York");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [sel, setSel] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(""); // Cal.com wants an attendee email
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const svc = services.find(s => s.id === svcId) || null;

  async function loadServices() {
    const { data, error } = await supabase
      .from("services")
      .select("id,name,active,default_price_cents,event_type_id,duration_min")
      .order("name", { ascending: true });
    if (!error) {
      const rows = (data ?? []).filter(r => r.active !== false); // show inactive? tweak if needed
      setServices(rows as Service[]);
      if (!svcId && rows.length) setSvcId(rows[0].id);
    }
  }

  async function loadSlots() {
    setSlots([]);
    setSel(null);
    setMsg(null);
    if (!svc) return;

    const evtId = svc.event_type_id;
    if (!evtId) {
      setMsg("This service is missing its Cal Event Type ID (set it in Settings → Services).");
      return;
    }

    const params = new URLSearchParams({
      eventTypeId: String(evtId),
      date,
      timeZone: tz,
    });
    if (svc.duration_min) params.set("duration", String(svc.duration_min));

    const r = await fetch(`/api/cal/availability?${params.toString()}`, { cache: "no-store" });
    const json = await r.json();
    if (!r.ok) {
      setMsg(json?.body?.error?.message || json.error || "Failed to load availability.");
      return;
    }
    setSlots((json.slots ?? []) as Slot[]);
    if ((json.slots ?? []).length === 0) setMsg("No available times on this day.");
  }

  useEffect(() => { loadServices(); }, []);
  useEffect(() => { if (svc) loadSlots(); /* eslint-disable-next-line */ }, [svcId, date, tz]);

  async function createAppointment() {
    try {
      setBusy(true);
      setMsg(null);
      if (!svc) throw new Error("Pick a service.");
      if (!sel) throw new Error("Pick a time.");
      if (!name) throw new Error("Enter the client name.");
      if (!email) throw new Error("Enter an email (required for Cal.com).");

      // 1) Book in Cal.com
      const bookRes = await fetch("/api/cal/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeId: svc.event_type_id,
          start: sel,                           // UTC
          timeZone: tz,
          name,
          email,
          phoneNumber: phone || undefined,
          lengthInMinutes: svc.duration_min ?? undefined,
          metadata: { source: "Covex Dashboard" },
        }),
      });
      const booked = await bookRes.json();
      if (!bookRes.ok) {
        throw new Error(booked?.body?.error?.message || booked.error || "Cal.com booking failed.");
      }

      // Pull out booking UID & start/end
      const cal = booked?.data ?? {};
      const bookingUid: string | undefined = cal.uid;
      const startUTC: string | undefined = cal.start;
      const endUTC: string | undefined = cal.end;

      // 2) Read current tenant (business) id
      const prof = await supabase.from("profiles").select("business_id").single();
      const business_id = prof.data?.business_id;
      if (!business_id) throw new Error("Could not resolve your business_id from profiles.");

      // 3) Insert into appointments
      const price_usd =
        (svc.default_price_cents ?? 0) > 0 ? Math.round((svc.default_price_cents ?? 0) / 100) : null;
      const end_ts =
        endUTC ?? addMinutes(sel, Math.max(15, Number(svc.duration_min ?? 0) || 30));

      const { error: insErr } = await supabase.from("appointments").insert({
        business_id,
        booking_id: bookingUid ?? null,
        status: "Booked",
        source: "Manual",
        caller_name: name,
        caller_phone_e164: phone || null,
        service_raw: svc.name,
        normalized_service: null,
        start_ts: startUTC ?? sel,
        end_ts,
        price_usd: price_usd,
      });

      if (insErr) throw insErr;
      setMsg("Booked and saved ✔");
      // optional: router.push("/appointments");
    } catch (e: any) {
      setMsg(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  // --- Simple calendar (month grid) ---
  // You already have a calendar UI elsewhere; keep this minimal for now.
  function DayButton({ ymd }: { ymd: string }) {
    const isSelected = date === ymd;
    return (
      <button
        onClick={() => setDate(ymd)}
        className={`px-3 py-2 rounded-xl border border-cx-border ${isSelected ? "bg-white/10" : "hover:bg-white/5"} mr-2 mb-2`}
      >
        {ymd.slice(8, 10)}
      </button>
    );
  }

  // quick month model: today ± 14 days
  const days = [...Array(28)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 7 + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">New Appointment</h2>

      {/* Service picker */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <label className="block text-sm text-cx-muted mb-2">Service</label>
        <select
          className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
          value={svcId ?? ""}
          onChange={(e) => setSvcId(Number(e.target.value))}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.duration_min ? ` • ${s.duration_min}m` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Calendar + slots */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-start gap-6">
          <div className="flex-1">
            <div className="text-cx-muted text-sm mb-2">Pick a date</div>
            <div className="flex flex-wrap">
              {days.map((d) => (
                <DayButton key={d} ymd={d} />
              ))}
            </div>
          </div>

          <div className="w-80">
            <div className="text-cx-muted text-sm mb-2">Available times</div>
            <div className="flex flex-wrap gap-2">
              {slots.map((iso) => {
                const d = new Date(iso);
                const label = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                const isActive = sel === iso;
                return (
                  <button
                    key={iso}
                    onClick={() => setSel(iso)}
                    className={`px-3 py-1.5 rounded-xl border border-cx-border ${
                      isActive ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              {slots.length === 0 && <div className="text-cx-muted text-sm">No times.</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Client details */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm text-cx-muted mb-1">Client name</label>
            <input
              className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-cx-muted mb-1">Client email</label>
            <input
              className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-cx-muted mb-1">Phone (E.164)</label>
            <input
              className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        {msg && <div className="mt-3 text-sm text-rose-400">{msg}</div>}

        <div className="mt-4 flex gap-3">
          <button
            onClick={createAppointment}
            disabled={busy}
            className="btn-pill btn-pill--active"
          >
            {busy ? "Booking…" : "Create appointment"}
          </button>
          <a href="/appointments" className="btn-pill">Cancel</a>
        </div>
      </div>
    </div>
  );
}
