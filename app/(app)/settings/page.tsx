"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type Business = { id: string; name: string | null; industry: string | null; is_mobile: boolean };

// Popular to less popular
const INDUSTRIES = [
  // Field services & home services (often mobile)
  "plumbing","hvac","electrician","cleaning","landscaping","pest_control","handyman",
  "auto_repair","mobile_detailing","car_wash","locksmith","roofing","painting","moving",
  // Personal services
  "barbers","hair_salon","nail_salon","spa","massage","personal_training","photography","tutoring",
  "pet_grooming",
  // Clinics / in-office
  "dentistry","chiropractic",
  // Catch-all
  "other"
] as const;

type Industry = typeof INDUSTRIES[number];

export default function SettingsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [biz, setBiz] = useState<Business | null>(null);
  const [industry, setIndustry] = useState<Industry>("other");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("businesses")
      .select("id,name,industry,is_mobile")
      .single();
    if (!error && data) {
      const b = data as Business;
      setBiz(b);
      setIndustry(((b.industry as Industry) ?? "other"));
    }
  }

  useEffect(() => { load(); }, []);

  async function seed() {
    if (!biz) return;
    setBusy(true); setMsg(null);
    const { error: uErr } = await supabase.from("businesses").update({ industry }).eq("id", biz.id);
    const { error: sErr } = await supabase.rpc("seed_services_for_business_id", {
      p_business: biz.id,
      p_industry: industry,
    });
    setBusy(false);
    if (uErr || sErr) setMsg(uErr?.message ?? sErr?.message ?? "Failed to seed");
    else setMsg(`Seeded services for ${industry}`);
  }

  async function setMobile(on: boolean) {
    if (!biz) return;
    setMsg(null);
    setBiz(prev => prev ? ({ ...prev, is_mobile: on }) : prev); // optimistic
    const { error } = await supabase.from("businesses").update({ is_mobile: on }).eq("id", biz.id);
    if (error) { setMsg(error.message); load(); }
    else setMsg(on ? "On-site mode: ON (addresses will show)" : "On-site mode: OFF (no addresses)");
  }

  return (
    <div className="space-y-6">
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h2 className="font-semibold mb-2">Business</h2>
        {biz ? (
          <div className="text-sm space-y-4">
            <div>
              <div className="text-cx-muted">ID</div>
              <div className="break-all">{biz.id}</div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-cx-muted">Industry</label>
              <select
                value={industry}
                onChange={(e)=>setIndustry(e.target.value as Industry)}
                className="btn-pill bg-white/5 text-white [color-scheme:dark]"
              >
                {INDUSTRIES.map(i => (
                  <option key={i} value={i} className="text-black bg-white">{i}</option>
                ))}
              </select>
              <button onClick={seed} disabled={busy} className="btn-pill btn-pill--active">
                {busy ? "Seeding..." : "Seed services"}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-cx-muted">On-site visits</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={()=>setMobile(true)}
                  className={`btn-pill ${biz.is_mobile ? "btn-pill--active" : ""}`}
                >
                  We go to the customer
                </button>
                <button
                  onClick={()=>setMobile(false)}
                  className={`btn-pill ${!biz.is_mobile ? "btn-pill--active" : ""}`}
                >
                  Customers come to us
                </button>
              </div>
              <p className="text-xs text-cx-muted">
                If “We go to the customer” is ON, the app will show address fields in Appointments and Overview. Turn it OFF for in-office businesses like dentistry/chiro.
              </p>
            </div>

            {msg && <div className="text-sm text-cx-muted">{msg}</div>}
          </div>
        ) : (
          <div className="text-cx-muted text-sm">Loading…</div>
        )}
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Services</h2>
          <Link href="/settings/services" className="btn-pill btn-pill--active">Manage services</Link>
        </div>
        <p className="text-sm text-cx-muted mt-2">
          Add/edit your services (name, code, price). Use “Seed services” above to start, then customize.
        </p>
      </div>
    </div>
  );
}
