"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type Biz = { id: string; is_mobile: boolean };
type Service = {
  id: number;
  name: string;
  active: boolean;
  slot_minutes: number | null;
  event_type_id: number | null;
};

function startOfDayUTC(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString();
}
function endOfDayUTC(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString();
}
function plusMinutesISO(iso: string, m: number) {
  const d = new Date(iso);
  return new Date(d.getTime() + m * 60000).toISOString();
}

export default function NewAppointmentPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const router = useRouter();

  const [biz, setBiz] = useState<Biz | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // form state
  const [serviceId, setServiceId] = useState<number | "">("");
  const selectedService = services.find((s) => s.id === serviceId) || null;

  const [monthCursor, setMonthCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedStartISO, setSelectedStartISO] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    async function load() {
      const b = await supabase.from("businesses").select("id,is_mobile").single();
      const svc = await supabase
        .from("services")
        .select("id,name,active,slot_minutes,event_type_id")
        .eq("active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });

      if (!b.error && b.data) setBiz(b.data as Biz);
      if (!svc.error && svc.data) {
        setServices(
          (svc.data as any[]).map((s) => ({
            ...s,
            slot_minutes: s.slot_minutes ?? 60,
          }))
        );
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  // ---- Availability (GET) ----
  async function loadDaySlots(date: Date) {
    setMsg(null);
    setSlots([]);
    setSelectedStartISO(null);

    if (!selectedService?.event_type_id) {
      setMsg("This service is missing its Cal Event Type ID (set it in Settings → Services).");
      return;
    }

    setLoadingSlots(true);
    try {
      const start = startOfDayUTC(date);
      const end = endOfDayUTC(date);
      const q = new URLSearchParams({
        eventTypeId: String(selectedService.event_type_id),
        start,
        end,
        timeZone,
      }).toString();

      const r = await fetch(`/api/cal/availability?${q}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({} as any));

      if (!r.ok) {
        setMsg(
          typeof j?.error === "string"
            ? `Availability error: ${j.error}`
            : "Cal.com availability failed"
        );
        return;
      }

      const arr: string[] = Array.isArray(j?.slots) ? j.slots : [];
      // For today, keep only future times
      const now = new Date();
      const filtered =
        date.toDateString() === now.toDateString()
          ? arr.filter((iso) => new Date(iso) > now)
          : arr;

      setSlots(filtered);
      if (filtered.length === 0) setMsg("No available times on this day.");
    } catch (err: any) {
      setMsg("Cal.com availability failed");
    } finally {
      setLoadingSlots(false);
    }
  }

  // Calendar grid
  const days = buildMonthDays(monthCursor);
  function buildMonthDays(d: Date) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const first = new Date(y, m, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - ((first.getDay() + 6) % 7)); // Monday grid
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const x = new Date(start);
      x.setDate(start.getDate() + i);
      cells.push(x);
    }
    return cells;
  }
  function isSameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  async function submit() {
    setMsg(null);
    if (!biz) return setMsg("Loading business…");
    if (!selectedService) return setMsg("Pick a service");
    if (!selectedService.event_type_id) return setMsg("This service is missing its Cal Event Type ID.");
    if (!selectedDate) return setMsg("Pick a date on the calendar");
    if (!selectedStartISO) return setMsg("Pick a time slot");
    if (!name.trim()) return setMsg("Enter a name");

    setBusy(true);
    try {
      const slotLen = selectedService.slot_minutes ?? 60;
      const start_ts = selectedStartISO;
      const end_ts = plusMinutesISO(start_ts, slotLen);

      // local overlap guard
      const overlap = await supabase
        .from("appointments")
        .select("id,start_ts,status")
        .gte("start_ts", start_ts)
        .lt("start_ts", end_ts);
      const taken = (overlap.data || []).some(
        (r) => String(r.status).toLowerCase() !== "cancelled"
      );
      if (taken) {
        setMsg("That time overlaps with an existing appointment.");
        setBusy(false);
        return;
      }

      // insert locally
      const payload: any = {
        business_id: biz.id,
        start_ts,
        end_ts,
        status: "Booked",
        caller_name: name.trim(),
        caller_phone_e164: phone.trim() || null,
        service_raw: selectedService.name,
        normalized_service: null,
        price_usd: null,
        address_text: biz.is_mobile ? (address.trim() || null) : null,
      };
      const { data: created, error: insErr } = await supabase
        .from("appointments")
        .insert(payload)
        .select("id")
        .single();
      if (insErr || !created) {
        setMsg(insErr?.message || "Failed to create appointment");
        setBusy(false);
        return;
      }

      // (Optional) book on Cal.com later once we add email collection
      // await fetch("/api/cal/book", { ... })

      router.replace("/appointments");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="text-cx-muted">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => history.back()} className="btn-pill">
            ← Back
          </button>
          <h1 className="text-lg font-semibold">New Appointment</h1>
        </div>
      </div>

      {/* Service picker */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <label className="block text-sm text-cx-muted mb-1">Service</label>
        <select
          value={serviceId}
          onChange={(e) => {
            const v = e.target.value ? Number(e.target.value) : "";
            setServiceId(v);
            setSelectedDate(null);
            setSlots([]);
            setSelectedStartISO(null);
            setMsg(null);
          }}
          className="w-full max-w-md px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none [color-scheme:dark]"
        >
          <option value="" className="text-black bg-white">
            Select a service…
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id} className="text-black bg-white">
              {s.name} • {s.slot_minutes ?? 60}m {s.event_type_id ? "" : "(set Event Type ID in Settings)"}
            </option>
          ))}
        </select>
      </div>

      {/* Calendar + Times */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <button
                className="btn-pill"
                onClick={() =>
                  setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))
                }
              >
                ←
              </button>
              <div className="font-semibold">
                {monthCursor.toLocaleString(undefined, { month: "long", year: "numeric" })}
              </div>
              <button
                className="btn-pill"
                onClick={() =>
                  setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))
                }
              >
                →
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-cx-muted mb-1">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {days.map((d, idx) => {
                const out = d.getMonth() !== monthCursor.getMonth();
                const past = d < new Date(new Date().toDateString());
                const isSel = selectedDate && isSameDay(d, selectedDate);
                return (
                  <button
                    key={idx}
                    disabled={past || !selectedService}
                    onClick={() => {
                      setSelectedDate(d);
                      if (selectedService) loadDaySlots(d);
                    }}
                    className={[
                      "h-16 rounded-xl border transition text-sm flex items-center justify-center",
                      isSel ? "border-white/80 bg-white/10 text-white" : "border-cx-border",
                      out ? "opacity-40" : "",
                      past ? "opacity-30 cursor-not-allowed" : "hover:bg-white/5",
                    ].join(" ")}
                    title={d.toDateString()}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Times */}
          <div>
            <div className="font-semibold mb-2">Available times</div>
            {!selectedDate && (
              <div className="text-cx-muted text-sm">Pick a date on the calendar.</div>
            )}
            {selectedDate && loadingSlots && (
              <div className="text-cx-muted text-sm">Loading times…</div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {slots.map((iso) => (
                <button
                  key={iso}
                  onClick={() => setSelectedStartISO(iso)}
                  className={[
                    "px-3 py-2 rounded-xl border",
                    selectedStartISO === iso
                      ? "border-white/80 bg-white/10 text-white"
                      : "border-cx-border hover:bg-white/5",
                  ].join(" ")}
                >
                  {new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </button>
              ))}
            </div>
            {msg && <div className="text-rose-400 text-sm mt-3">{msg}</div>}
          </div>
        </div>
      </div>

      {/* Person details */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-cx-muted mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
              placeholder="Client name"
            />
          </div>
          <div>
            <label className="block text-sm text-cx-muted mb-1">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
              placeholder="+1…"
            />
          </div>
          {biz?.is_mobile && (
            <div className="md:col-span-2">
              <label className="block text-sm text-cx-muted mb-1">Address (for on-site jobs)</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
                placeholder="Street, city, etc."
              />
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={submit} disabled={busy} className="btn-pill btn-pill--active">
            {busy ? "Creating…" : "Create appointment"}
          </button>
          <button onClick={() => router.replace("/appointments")} className="btn-pill">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
