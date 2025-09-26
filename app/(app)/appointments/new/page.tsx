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
  sort_order: number | null;
};

type BizRow = { id: string; is_mobile: boolean };

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

  const [biz, setBiz] = useState<BizRow | null>(null);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [serviceId, setServiceId] = useState<number | null>(null);

  const [date, setDate] = useState<Date>(() => new Date());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedISO, setSelectedISO] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState(""); // 10 digits
  const phoneE164 = US_CC + phoneLocal;

  const [addressText, setAddressText] = useState(""); // ← NEW
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = services.find((s) => s.id === serviceId) || null;

  // load business (id + is_mobile) + realtime for toggle
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      const { data } = await supabase.from("businesses").select("id,is_mobile").maybeSingle<BizRow>();
      if (data) setBiz(data);

      if (data?.id) {
        const ch = supabase
          .channel("rt-biz-is-mobile-new-appt")
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "businesses", filter: `id=eq.${data.id}` },
            payload => setBiz(prev => prev ? { ...prev, is_mobile: !!(payload.new as any)?.is_mobile } : (payload.new as BizRow))
          )
          .subscribe();
        unsub = () => supabase.removeChannel(ch);
      }
    })();

    return () => { unsub?.(); };
  }, [supabase]);

  // load services (active for this business)
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

  // fetch slots from Cal.com
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
  }, [serviceId, date, current?.event_type_id]);

  async function createAppt() {
    setErr(null);

    // Validate inputs
    if (!current?.event_type_id) return setErr("This service is missing its Cal Event Type ID.");
    if (!selectedISO) return setErr("Please select a time.");
    if (!name.trim()) return setErr("Client name is required.");
    if (!email.trim()) return setErr("Client email is required.");
    if (phoneLocal.replace(/\D/g, "").length !== 10) return setErr("Enter a 10-digit US phone number.");
    if (biz?.is_mobile && !addressText.trim()) return setErr("Service address is required for on-site visits.");

    setBusy(true);
    try {
      if (!biz?.id) {
        throw new Error("No business is linked to this account yet. Open Settings and click “Fix now”, then try again.");
      }

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
        business_id: biz.id,
        booking_id: j?.data?.id ?? null,
        status: "Booked",
        source: "Dashboard",
        caller_name: payload.name,
        caller_phone_e164: phoneE164,
        service_raw: current.name,
        normalized_service: current.code,
        start_ts: selectedISO,
        price_usd: priceUsd,
        address_text: biz.is_mobile ? addressText.trim() : null,   // ← NEW
      });

      if (insErr) throw new Error(`Database insert failed: ${insErr.message}`);

      alert("Appointment created ✅");
      setSelectedISO(null);
      setAddressText("");
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

  const showAddress = !!biz?.is_mobile;

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

        {showAddress && (
          <div className="mt-4">
            <div className="text-sm text-cx-muted mb-1">Service address</div>
            <textarea
              className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2 min-h-[90px]"
              placeholder="123 Main St, Suite 4 • City, ST 12345"
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
            />
            <div className="text-xs text-cx-muted mt-1">Shown to you on the schedule and lists.</div>
          </div>
        )}

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
