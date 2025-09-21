"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabaseBrowser";

function toISO(local: string) { return new Date(local).toISOString(); }
function addMins(iso: string, m: number) { const d = new Date(iso); d.setMinutes(d.getMinutes() + m); return d.toISOString(); }

type Biz = { id: string; is_mobile: boolean };
type Service = { id: number; name: string; code: string; default_price_usd: number | string; active: boolean; slot_minutes: number; event_type_id: number | null };

export default function NewAppointmentPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const router = useRouter();

  const [biz, setBiz] = useState<Biz | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const [serviceId, setServiceId] = useState<number | "">("");
  const [startLocal, setStartLocal] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedService = services.find(s => s.id === serviceId) || null;
  const slot = selectedService?.slot_minutes ?? 60;
  const eventTypeId = selectedService?.event_type_id ?? null;

  useEffect(() => {
    async function load() {
      const b = await supabase.from("businesses").select("id,is_mobile").single();
      const svc = await supabase
        .from("services")
        .select("id,name,code,default_price_usd,active,slot_minutes,event_type_id")
        .eq("active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });

      if (!b.error && b.data) setBiz(b.data as Biz);
      if (!svc.error && svc.data) setServices(svc.data as Service[]);
      setLoading(false);
    }
    load();
  }, []);

  async function submit() {
    setMsg(null);
    if (!biz) return setMsg("Loading business…");
    if (!serviceId) return setMsg("Pick a service");
    if (!eventTypeId) return setMsg("This service is missing its Cal Event Type ID (set it in Settings → Services).");
    if (!startLocal) return setMsg("Pick date & time");
    if (!name.trim()) return setMsg("Enter a name");

    setBusy(true);
    try {
      const start_ts = toISO(startLocal);
      const end_ts = addMins(start_ts, slot);
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      // 1) Ask Cal.com if this exact start is available
      const a = await fetch("/api/cal/availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventTypeId, start: start_ts, end: end_ts, timeZone }),
      });
      const aj = await a.json();
      if (!(aj?.ok && aj?.data?.available)) {
        setBusy(false);
        setMsg("That time isn’t available on Cal.com. Pick a different slot.");
        return;
      }

      // 2) Quick local overlap (exclude Cancelled)
      const overlap = await supabase
        .from("appointments")
        .select("id,start_ts,status")
        .gte("start_ts", start_ts)
        .lt("start_ts", end_ts)
        .order("start_ts");
      const taken = (overlap.data || []).some(r => String(r.status).toLowerCase() !== "cancelled");
      if (taken) {
        setBusy(false);
        setMsg("That time overlaps with an existing appointment.");
        return;
      }

      // 3) Insert locally first
      const payload: any = {
        business_id: biz.id,
        start_ts, end_ts,
        status: "Booked",
        caller_name: name.trim(),
        caller_phone_e164: phone.trim() || null,
        service_id: Number(serviceId),
        service_raw: selectedService?.name ?? null,
        normalized_service: null,
        price_usd: null,
        address_text: biz.is_mobile ? (address.trim() || null) : null,
      };

      const { data: created, error: insErr } = await supabase
        .from("appointments")
        .insert(payload)
        .select("id,start_ts,end_ts,caller_name,caller_phone_e164,service_id,address_text")
        .single();
      if (insErr || !created) {
        setBusy(false);
        setMsg(insErr?.message || "Failed to create appointment");
        return;
      }

      // 4) Book on Cal.com
      const bResp = await fetch("/api/cal/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventTypeId,
          start: start_ts,
          end: end_ts,
          timeZone,
          invitee: { name: created.caller_name, phone: created.caller_phone_e164 },
          notes: biz.is_mobile ? created.address_text : undefined,
        }),
      });
      const bj = await bResp.json();
      const booking_id = bj?.ok ? (bj?.data?.booking_id || bj?.data?.raw?.id) : undefined;
      if (booking_id) {
        await supabase.from("appointments").update({ booking_id }).eq("id", created.id);
      }

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
          <button onClick={() => history.back()} className="btn-pill">← Back</button>
          <h1 className="text-lg font-semibold">New Appointment</h1>
        </div>
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Service */}
          <div>
            <label className="block text-sm text-cx-muted mb-1">Service</label>
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value ? Number(e.target.value) : "")}
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none [color-scheme:dark]"
            >
              <option value="" className="text-black bg-white">Select a service…</option>
              {services.map(s => (
                <option key={s.id} value={s.id} className="text-black bg-white">
                  {s.name} ({s.slot_minutes}m){!s.event_type_id ? " – MISSING EVENT TYPE" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Date & time */}
          <div>
            <label className="block text-sm text-cx-muted mb-1">Date & time</label>
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm text-cx-muted mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client name"
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm text-cx-muted mb-1">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1…"
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
            />
          </div>

          {/* Address (for mobile businesses) */}
          {biz?.is_mobile && (
            <div className="md:col-span-2">
              <label className="block text-sm text-cx-muted mb-1">Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, city, etc."
                className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
              />
            </div>
          )}
        </div>

        {msg && <div className="text-sm text-rose-400 mt-4">{msg}</div>}

        <div className="mt-6 flex items-center gap-3">
          <button onClick={submit} disabled={busy} className="btn-pill btn-pill--active">
            {busy ? "Creating…" : "Create appointment"}
          </button>
          <button onClick={() => router.replace("/appointments")} className="btn-pill">Cancel</button>
        </div>
      </div>
    </div>
  );
}
