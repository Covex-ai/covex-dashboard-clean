"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

// ---- Types you likely already have in DB ----
type Service = {
  id: number;
  business_id?: string | null;
  name: string;
  active?: boolean | null;
  default_price_cents?: number | null;
  event_type_id?: number | null;  // Cal.com Event Type ID
  duration_min?: number | null;   // optional: length to request
  sort_order?: number | null;
};

type Slot = string; // ISO UTC, e.g. "2025-09-22T14:00:00Z"

// Build month grid
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function NewAppointmentPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [businessId, setBusinessId] = useState<string | null>(null);

  const [services, setServices] = useState<Service[]>([]);
  const [svcId, setSvcId] = useState<number | "">("");

  const [monthCursor, setMonthCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [date, setDate] = useState<string>(() => ymd(new Date()));
  const [tz] = useState<string>(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");

  const [slots, setSlots] = useState<Slot[]>([]);
  const [sel, setSel] = useState<Slot | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const svc = services.find(s => s.id === svcId) || null;

  // 1) Load current tenant (business) id
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("profiles").select("business_id").single();
      if (!error && data?.business_id) setBusinessId(data.business_id);
    })();
  }, [supabase]);

  // 2) Load services for that business
  useEffect(() => {
    if (!businessId) return;
    (async () => {
      setMsg(null);
      const { data, error } = await supabase
        .from("services")
        .select("id,business_id,name,active,default_price_cents,event_type_id,duration_min,sort_order")
        .eq("business_id", businessId)
        .order("sort_order", { ascending: true });
      if (error) {
        setMsg("Could not load services.");
        setServices([]);
        setSvcId("");
        return;
      }
      const rows = (data ?? []).filter(r => r.active !== false);
      setServices(rows as Service[]);
      setSvcId(rows.length ? rows[0].id : "");
    })();
  }, [businessId, supabase]);

  // 3) When service/date changes, load slots from our API
  useEffect(() => {
    if (!svc) { setSlots([]); setSel(null); return; }
    if (!svc.event_type_id) { setMsg("This service is missing its Cal Event Type ID (Settings → Services)."); setSlots([]); setSel(null); return; }

    (async () => {
      setMsg(null);
      setSlots([]);
      setSel(null);

      const qs = new URLSearchParams({
        eventTypeId: String(svc.event_type_id),
        date,
        timeZone: tz,
      });
      if (svc.duration_min) qs.set("duration", String(svc.duration_min));

      const r = await fetch(`/api/cal/availability?${qs.toString()}`, { cache: "no-store" });
      const json = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(json?.body?.error?.message || json?.error || "Failed to load availability.");
        return;
      }
      setSlots(json?.slots ?? []);
      if ((json?.slots ?? []).length === 0) setMsg("No available times on this day.");
    })();
  }, [svcId, date, tz]); // eslint-disable-line react-hooks/exhaustive-deps

  // Month grid days
  const daysInMonth = (() => {
    const first = startOfMonth(monthCursor);
    const last = endOfMonth(monthCursor);
    const result: string[] = [];

    // pad to Monday-start grid (change to Sunday if you prefer)
    const pad = (first.getDay() + 6) % 7; // 0..6, Monday=0
    for (let i = 0; i < pad; i++) result.push("");

    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      result.push(ymd(d));
    }
    return result;
  })();

  function nextMonth(n: number) {
    const nm = addMonths(monthCursor, n);
    setMonthCursor(startOfMonth(nm));
  }

  function onDayClick(ymdStr: string) {
    if (!ymdStr) return;
    setDate(ymdStr);
  }

  function localLabelFromUTC(isoUTC: string) {
    const d = new Date(isoUTC);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  async function createAppointment() {
    try {
      setBusy(true);
      setMsg(null);
      if (!svc) throw new Error("Pick a service.");
      if (!svc.event_type_id) throw new Error("This service is missing its Cal Event Type ID.");
      if (!sel) throw new Error("Pick a time.");
      if (!name) throw new Error("Enter the client name.");
      if (!email) throw new Error("Enter an email (required by Cal.com).");

      // 1) Book in Cal.com
      const res = await fetch("/api/cal/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventTypeId: svc.event_type_id,
          start: sel,               // UTC time from /slots
          timeZone: tz,
          name,
          email,
          phoneNumber: phone || undefined,
          lengthInMinutes: svc.duration_min ?? undefined,
          metadata: { source: "Covex Dashboard" },
        }),
      });
      const booked = await res.json();
      if (!res.ok) {
        throw new Error(booked?.body?.error?.message || booked?.error || "Cal.com booking failed.");
      }

      const cal = booked?.data ?? {};
      const bookingUid: string | undefined = cal.uid;
      const startUTC: string | undefined = cal.start;
      const endUTC: string | undefined = cal.end;

      // 2) Insert into appointments
      const price_usd = (svc.default_price_cents ?? 0) > 0
        ? Math.round((svc.default_price_cents ?? 0) / 100)
        : null;

      const { data: prof, error: profErr } = await supabase.from("profiles").select("business_id").single();
      if (profErr || !prof?.business_id) throw new Error("Could not resolve your business id.");

      const { error: insErr } = await supabase.from("appointments").insert({
        business_id: prof.business_id,
        booking_id: bookingUid ?? null,
        status: "Booked",
        source: "Manual",
        caller_name: name,
        caller_phone_e164: phone || null,
        service_raw: svc.name,
        normalized_service: null,
        start_ts: startUTC ?? sel,
        end_ts: endUTC ?? sel, // Cal returns end; if not, you can add duration math
        price_usd: price_usd,
      });

      if (insErr) throw insErr;
      setMsg("Booked and saved ✔");
      // window.location.href = "/appointments"; // optional redirect
    } catch (e: any) {
      setMsg(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">New Appointment</h2>

      {/* Service picker */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <label className="block text-sm text-cx-muted mb-2">Service</label>
        <select
          className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
          value={svcId}
          onChange={(e) => setSvcId(e.target.value ? Number(e.target.value) : "")}
        >
          {services.length === 0 && <option value="">No services found</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{s.duration_min ? ` • ${s.duration_min}m` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Calendar + slots */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-start gap-6">
          {/* Month grid */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-3">
              <button className="btn-pill" onClick={() => nextMonth(-1)}>←</button>
              <div className="font-medium">
                {monthCursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
              </div>
              <button className="btn-pill" onClick={() => nextMonth(1)}>→</button>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
                <div key={d} className="text-xs text-cx-muted">{d}</div>
              ))}
              {daysInMonth.map((d, i) => {
                if (!d) return <div key={`pad-${i}`} />;
                const selected = d === date;
                return (
                  <button
                    key={d}
                    onClick={() => onDayClick(d)}
                    className={`h-10 rounded-xl border border-cx-border text-sm
                      ${selected ? "bg-white/10" : "hover:bg-white/5"}`}
                  >
                    {d.slice(8,10)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slots */}
          <div className="w-80">
            <div className="text-cx-muted text-sm mb-2">Available times</div>
            <div className="flex flex-wrap gap-2">
              {slots.map((iso) => {
                const isActive = sel === iso;
                return (
                  <button
                    key={iso}
                    onClick={() => setSel(iso)}
                    className={`px-3 py-1.5 rounded-xl border border-cx-border ${isActive ? "bg-white/10" : "hover:bg-white/5"}`}
                  >
                    {localLabelFromUTC(iso)}
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
            <input className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-cx-muted mb-1">Client email</label>
            <input className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={email} onChange={e=>setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-cx-muted mb-1">Phone (E.164)</label>
            <input className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={phone} onChange={e=>setPhone(e.target.value)} />
          </div>
        </div>

        {msg && <div className="mt-3 text-sm text-rose-400">{msg}</div>}

        <div className="mt-4 flex gap-3">
          <button onClick={createAppointment} disabled={busy} className="btn-pill btn-pill--active">
            {busy ? "Booking…" : "Create appointment"}
          </button>
          <a href="/appointments" className="btn-pill">Cancel</a>
        </div>
      </div>
    </div>
  );
}
