"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type Biz = {
  id: string;
  name: string | null;
  industry: string | null;
  is_mobile: boolean;
};

const INDUSTRIES: { value: string; label: string }[] = [
  { value: "plumbing", label: "Plumbing" },
  { value: "hvac", label: "HVAC" },
  { value: "barbers", label: "Barbers / Salon" },
  { value: "dentistry", label: "Dentistry" },
  { value: "chiropractic", label: "Chiropractic" },
  { value: "electrician", label: "Electrician" },
  { value: "cleaning", label: "House Cleaning" },
  { value: "landscaping", label: "Landscaping / Lawn Care" },
  { value: "pest_control", label: "Pest Control" },
  { value: "auto_repair", label: "Auto Repair / Mechanic" },
  { value: "handyman", label: "Handyman" },
  { value: "photography", label: "Photography" },
  { value: "massage", label: "Massage" },
  { value: "tutoring", label: "Tutoring / Education" },
  { value: "pet_grooming", label: "Pet Grooming" },
  { value: "mobile_detailing", label: "Mobile Detailing" },
  { value: "other", label: "Other" },
];

export default function SettingsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function ensureBiz() {
    try {
      await supabase.rpc("ensure_profile_and_business");
    } catch (e: any) {
      setMsg(e?.message ?? "Could not ensure business.");
    }
  }

  async function readBiz() {
    setLoading(true);
    setMsg(null);
    await ensureBiz();
    const { data, error } = await supabase
      .from("businesses")
      .select("id,name,industry,is_mobile")
      .maybeSingle();
    if (error) setMsg(error.message);
    setBiz((data as Biz) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    readBiz();
  }, []);

  // Realtime subscription for THIS business row only
  useEffect(() => {
    if (!biz?.id) return;
    const ch = supabase
      .channel("rt-businesses")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "businesses", filter: `id=eq.${biz.id}` },
        () => readBiz()
      )
      .subscribe();

    // IMPORTANT: do NOT return a Promise here. Swallow it.
    return () => {
      void supabase.removeChannel(ch); // ignore returned Promise
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz?.id]);

  async function patch(updates: Partial<Biz>) {
    if (!biz) return;
    setSaving(true);
    setMsg(null);
    const { data, error } = await supabase
      .from("businesses")
      .update(updates)
      .eq("id", biz.id)
      .select("id,name,industry,is_mobile")
      .single();
    setSaving(false);
    if (error) {
      setMsg(error.message);
      await readBiz(); // restore server truth
      return;
    }
    setBiz(data as Biz);
  }

  if (loading) return <div className="text-cx-muted">Loading…</div>;

  if (!biz) {
    return (
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4 space-y-3">
        <div className="text-rose-400">No business found for this account.</div>
        <div className="text-cx-muted text-sm">Click “Fix now”, then refresh.</div>
        <div className="flex gap-2">
          <button className="btn-pill btn-pill--active" onClick={readBiz}>Fix now</button>
          <button className="btn-pill" onClick={() => location.reload()}>Refresh</button>
        </div>
        {msg && <div className="text-rose-400 text-sm">{msg}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Settings</h1>
        <Link href="/settings/services" className="btn-pill btn-pill--active">
          Manage services →
        </Link>
      </div>

      {/* Business card */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4 space-y-4">
        <h2 className="font-semibold">Business</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* ID */}
          <div>
            <div className="text-sm text-cx-muted mb-1">Business ID</div>
            <div className="flex items-center gap-2">
              <code className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border text-xs break-all">
                {biz.id}
              </code>
              <button className="btn-pill" onClick={() => navigator.clipboard.writeText(biz.id)}>
                Copy
              </button>
            </div>
          </div>

          {/* Visit type */}
          <div>
            <div className="text-sm text-cx-muted mb-1">Visit type</div>
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {biz.is_mobile ? "We go to the customer" : "Customers come to us"}
              </span>
              <button
                className={`px-3 py-1.5 rounded-xl text-sm font-medium ${
                  biz.is_mobile ? "bg-white/10 text-white" : "bg-white/5 text-cx-muted border border-cx-border"
                }`}
                onClick={() => patch({ is_mobile: !biz.is_mobile })}
                disabled={saving}
              >
                {biz.is_mobile ? "On-site (ON)" : "On-site (OFF)"}
              </button>
            </div>
            <div className="text-xs text-cx-muted mt-1">
              When ON, address fields show on New Appointment & tables.
            </div>
          </div>

          {/* Industry */}
          <div>
            <div className="text-sm text-cx-muted mb-1">Industry / Niche</div>
            <select
              value={biz.industry ?? ""}
              onChange={(e) => patch({ industry: e.target.value || null })}
              disabled={saving}
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none [color-scheme:dark]"
            >
              <option value="" className="text-black bg-white">Select an industry…</option>
              {INDUSTRIES.map((i) => (
                <option key={i.value} value={i.value} className="text-black bg-white">
                  {i.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {msg && <div className="text-rose-400 text-sm">{msg}</div>}
      </div>
    </div>
  );
}
