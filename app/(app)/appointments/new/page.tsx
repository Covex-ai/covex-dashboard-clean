"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type ServiceRow = {
  id: number;
  business_id: string;
  code: string;                 // unique per business (e.g., CLEAN_45)
  name: string;                 // display name
  event_type_id: number | null; // Cal.com event type id
  duration_min: number | null;
  default_price_cents: number | null;
  active: boolean;
  sort_order: number | null;
};

type RawSlot = string | { start?: string; startTime?: string; time?: string; utcStart?: string };
type Slot = { iso: string };

const US_CC = "+1";
const tz = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; }
  catch { return "America/New_York"; }
};
const toSlots = (rawList: RawSlot[]): Slot[] => {
  const out: Slot[] = [];
  for (const r of rawList ?? []) {
    const iso =
      typeof r === "string" ? r : r?.start || r?.startTime || r?.utcStart || r?.time || null;
    if (iso && !Number.isNaN(Date.parse(iso))) out.push({ iso });
  }
  return out;
};
const msgOf = (e: any) => (typeof e === "string" ? e : e?.message || JSON.stringify(e));

export default function NewAppointmentPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [serviceId, setServiceId] = useState<number | null>(null);

  const [date, setDate] = useState<Date>(() => new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedISO, setSelectedISO] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState(""); // 10 digits
  const phoneE164 = US_CC + phoneLocal;

  const [bizId, setBizId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = services.find((s) => s.id === serviceId) || null;

  // --- Ensure business_id for this user (critical for mirroring) ---
  async function ensureBusinessId(): Promise<string | null> {
    // 1) try to read
    const { data: p } = await supabase.from("profiles").select("business_id").single();
    if (p?.business_id) return p.business_id as string;

    // 2) try to create via RPC if available
    try {
      // This RPC must exist per our earlier setup; if not, it will throw and we just re-read
      await supabase.rpc("ensure_business_for_me");
      const { data: p2 } = await supabase.from("profiles").select("business_id").single();
      return p2?.business_id ?? null;
    } catch {
      // fallback: re-read once more anyway
      const { data: p3 } = await supabase.from("profiles").select("business_id").single();
      return p3?.business_id ?? null;
    }
  }

  useEffect(() => {
    (async () => {
      const id = await ensureBusinessId();
      setBizId(id ?? null);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) setErr(msgOf(error));
      const list = (data as ServiceRow[]) || [];
      setServices(list);
      if (list.length && !serviceId) setServiceId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSlots([]); setSelectedISO(null); setErr(null);
    if (!current?.event_type_id) return;

    (async () => {
      try {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        const day = `${y}-${m}-${d}`;
        const usp = new URLSearchParams({
          eventTypeId: String(current.event_type_id),
          date: day,
          timeZone: tz(),
        });
        const r = await fetch(`/api/cal/availability?${usp}`);
        const j = await r.json();
        if (!r.ok) throw new Error(msgOf(j?.error || j));
        setSlots(toSlots(j?.slots ?? []));
      } catch (e) {
        setErr(msgOf(e));
      }
    })();
  }, [serviceId, date, current?.event_type_id]); // include event_type_id safety

  async function createAppt() {
    setErr(null);

    // Validate inputs
    if (!current?.event_type_id) return setErr("This service is missing its Cal Event Type ID.");
    if (!selectedISO) return setErr("Please select a time.");
    if (!name.trim()) return setErr("Client name is required.");
    if (!email.trim()) return setErr("Client email is required.");
    if (phoneLocal.replace(/\D/g, "").length !== 10) return setErr("Enter a 10-digit US phone number.");

    setBusy(true);
    try {
      // Make sure we have a business_id for mirroring (create if missing)
      const business_id = bizId ?? (await ensureBusinessId());
      if (!business_id) {
        throw new Error(
          "No business is linked to this account yet. Open Settings and click “Fix now”, then try again."
        );
      }
      setBizId(business_id);

      // 1) Book on Cal.com
      const payload = {
        eventTypeId: current.event_type_id,
        startISO: selectedISO,
        name: name.trim(),
        email: email.trim(),
        timeZone: tz(),
        phone: phoneE164,
      };
      const r = await fetch("/api/cal/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(msgOf(j?.error || j));

      // 2) Mirror into Supabase
      const priceUsd =
        current.default_price_cents != null
          ? Math.round(current.default_price_cents / 100)
          : null;

      const { error: insErr } = await supabase.from("appointments").insert({
        business_id,
        booking_id: j?.data?.id ?? null,
        status: "Booked",
        source: "Dashboard",
        caller_name: payload.name,
        caller_phone_e164: phoneE164,
        service_raw: current.name,
        normalized_service: current.code, // keep your code as your normalized tag
        start_ts: selectedISO,
        price_usd: priceUsd,
      });

      if (insErr) {
        // Show the actual DB/RLS error so it’s debuggable
        throw new Error(`Database insert failed: ${insErr.message}`);
      }

      // 3) UX reset
      alert("Appointment created ✅");
      setSelectedISO(null);
    } catch (e) {
      setErr(msgOf(e));
    } finally {
      setBusy(false);
    }
  }

  const buildGrid = () => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7)); // Monday grid
    const list: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      list.push(d);
    }
    return list;
  };
  const grid = buildGrid();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New Appointment</h1>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="text-sm text-cx-muted mb-2">Service</div>
        <select
          value={serviceId ?? ""}
          onChange={(e) => setServiceId(Number(e.target.value))}
          className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
        >
          {services.length === 0 && <option value="">No services found</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.duration_min ? `• ${s.duration_min}m` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr,320px] gap-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <button className="btn-pill" onClick={() => { const d = new Date(date); d.setMonth(d.getMonth() - 1); setDate(d); }}>←</button>
              <div className="font-semibold">{date.toLocaleString(undefined, { month: "long", year: "numeric" })}</div>
              <button className="btn-pill" onClick={() => { const d = new Date(date); d.setMonth(d.getMonth() + 1); setDate(d); }}>→</button>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-sm text-cx-muted mb-2">
              <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {grid.map((d, i) => {
                const inMonth = d.getMonth() === date.getMonth();
                const selected = sameDay(d, date);
                return (
                  <button
                    key={i}
                    onClick={() => setDate(d)}
                    className={`rounded-xl h-12 border border-cx-border ${
                      selected ? "bg-white/10 text-white" : "bg-cx-bg text-cx-muted hover:text-white hover:bg-white/5"
                    } ${inMonth ? "" : "opacity-40"}`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="font-semibold mb-3">Available times</div>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => {
                const d = new Date(s.iso);
                const label = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                const isSel = selectedISO === s.iso;
                return (
                  <button
                    key={s.iso}
                    onClick={() => setSelectedISO(s.iso)}
                    className={`px-3 py-1.5 rounded-xl border border-cx-border ${
                      isSel ? "bg-white/10 text-white" : "text-cx-muted hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              {slots.length === 0 && <div className="text-cx-muted">No times.</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-cx-muted mb-1">Client name</div>
            <input className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
                   value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <div className="text-sm text-cx-muted mb-1">Client email</div>
            <input className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
                   value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" type="email" />
          </div>
          <div>
            <div className="text-sm text-cx-muted mb-1">Phone (US)</div>
            <div className="flex">
              <span className="px-3 py-2 rounded-l-xl border border-cx-border bg-cx-bg text-cx-muted select-none">{US_CC}</span>
              <input
                className="w-full bg-cx-bg border border-l-0 border-cx-border rounded-r-xl px-3 py-2"
                value={phoneLocal}
                onChange={(e) => setPhoneLocal(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="5551234567"
                inputMode="numeric"
                pattern="[0-9]*"
              />
            </div>
            <div className="text-xs text-cx-muted mt-1">Exactly 10 digits; country code is locked to +1.</div>
          </div>
        </div>

        {err && <div className="text-rose-400 text-sm mt-3">{err}</div>}

        <div className="mt-4 flex gap-3">
          <button className="btn-pill btn-pill--active" disabled={busy} onClick={createAppt}>
            {busy ? "Creating…" : "Create appointment"}
          </button>
          <button className="btn-pill" onClick={() => setSelectedISO(null)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
