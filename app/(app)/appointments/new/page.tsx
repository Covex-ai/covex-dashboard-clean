"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type ServiceRow = {
  id: number;
  business_id: string;
  code: string;
  name: string;
  event_type_id: number | null;
  duration_min: number | null;
  default_price_cents: number | null;
  active: boolean;
};

type RawSlot = string | { start?: string; startTime?: string; time?: string; utcStart?: string };
type Slot = { iso: string };

function tz() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

function normalizeE164(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (input.trim().startsWith("+")) return `+${digits}`;
  return digits ? `+${digits}` : "+1";
}

// ---- NEW: robust slot normalizer ----
function extractISO(raw: RawSlot): string | null {
  if (typeof raw === "string") return raw;
  if (raw?.start) return raw.start;
  if (raw?.startTime) return raw.startTime;
  if (raw?.utcStart) return raw.utcStart;
  if (raw?.time) return raw.time;
  return null;
}
function toSlots(rawList: RawSlot[]): Slot[] {
  const out: Slot[] = [];
  for (const r of rawList ?? []) {
    const iso = extractISO(r);
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms)) out.push({ iso });
  }
  return out;
}

export default function NewAppointmentPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [serviceId, setServiceId] = useState<number | null>(null);

  const [date, setDate] = useState<Date>(() => new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedISO, setSelectedISO] = useState<string | null>(null);

  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("+1"); // default +1

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const currentService = services.find((s) => s.id === serviceId) || null;

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (!error && data) {
        setServices(data as any);
        if (data.length && !serviceId) setServiceId((data[0] as any).id);
      }
    })();
  }, []);

  // Fetch availability when service/date changes
  useEffect(() => {
    setSlots([]);
    setSelectedISO(null);
    setErr(null);
    if (!currentService?.event_type_id) return;

    (async () => {
      try {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        const dayStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

        const usp = new URLSearchParams({
          eventTypeId: String(currentService.event_type_id),
          date: dayStr,
          timeZone: tz(),
        });
        const res = await fetch(`/api/cal/availability?${usp.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Availability failed");

        // Accept strings OR objects and coerce to ISO strings.
        const normalized = toSlots(json?.slots ?? []);
        setSlots(normalized);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load availability.");
      }
    })();
  }, [serviceId, date]);

  async function createAppt() {
    setErr(null);
    if (!currentService?.event_type_id) {
      setErr("This service is missing its Cal Event Type ID.");
      return;
    }
    if (!selectedISO) {
      setErr("Please select a time.");
      return;
    }
    const phoneE164 = normalizeE164(phone);
    const payload = {
      eventTypeId: currentService.event_type_id,
      startISO: selectedISO,
      name: name.trim(),
      email: email.trim(),
      timeZone: tz(),
      phone: phoneE164,
    };
    if (!payload.name || !payload.email) {
      setErr("Name and email are required.");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/cal/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        throw new Error(
          j?.error?.message || j?.error || j?.message || "Booking failed. Please try another time."
        );
      }

      // Mirror to Supabase appointments
      const { data: me } = await supabase
        .from("profiles")
        .select("business_id")
        .limit(1)
        .single();

      if (me?.business_id) {
        await supabase.from("appointments").insert({
          business_id: me.business_id,
          booking_id: j?.data?.id ?? null,
          status: "Booked",
          source: "Dashboard",
          caller_name: payload.name,
          caller_phone_e164: payload.phone,
          service_raw: currentService.name,
          normalized_service: currentService.code,
          start_ts: selectedISO,
          price_usd:
            currentService.default_price_cents != null
              ? Math.round(currentService.default_price_cents / 100)
              : null,
        });
      }

      alert("Appointment created ✅");
      setSelectedISO(null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  // Calendar grid (Mon-start)
  const days: Date[] = useMemo(() => {
    const first = new Date(date.getFullYear(), date.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - ((first.getDay() + 6) % 7));
    const list: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      list.push(d);
    }
    return list;
  }, [date]);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New Appointment</h1>

      {/* Service */}
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

      {/* Date & Times */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr,320px] gap-6">
          {/* Calendar */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <button
                className="btn-pill"
                onClick={() => {
                  const d = new Date(date);
                  d.setMonth(d.getMonth() - 1);
                  setDate(d);
                }}
              >
                ←
              </button>
              <div className="font-semibold">
                {date.toLocaleString(undefined, { month: "long", year: "numeric" })}
              </div>
              <button
                className="btn-pill"
                onClick={() => {
                  const d = new Date(date);
                  d.setMonth(d.getMonth() + 1);
                  setDate(d);
                }}
              >
                →
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-sm text-cx-muted mb-2">
              <div>Mon</div><div>Tue</div><div>Wed</div>
              <div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {days.map((d, i) => {
                const inMonth = d.getMonth() === date.getMonth();
                const selected = isSameDay(d, date);
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

          {/* Times */}
          <div>
            <div className="font-semibold mb-3">Available times</div>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => {
                const d = new Date(s.iso);
                const label =
                  Number.isNaN(d.getTime())
                    ? "Invalid"
                    : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

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

      {/* Details */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-cx-muted mb-1">Client name</div>
            <input
              className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
          </div>
          <div>
            <div className="text-sm text-cx-muted mb-1">Client email</div>
            <input
              className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              type="email"
            />
          </div>
          <div>
            <div className="text-sm text-cx-muted mb-1">Phone (E.164)</div>
            <input
              className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(normalizeE164(e.target.value))}
              placeholder="+1XXXXXXXXXX"
            />
          </div>
        </div>

        {err && <div className="text-rose-400 text-sm mt-3">{err}</div>}

        <div className="mt-4 flex gap-3">
          <button className="btn-pill btn-pill--active" disabled={busy} onClick={createAppt}>
            {busy ? "Creating…" : "Create appointment"}
          </button>
          <button
            className="btn-pill"
            onClick={() => {
              setSelectedISO(null);
              setErr(null);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
