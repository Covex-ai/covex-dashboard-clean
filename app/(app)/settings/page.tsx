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
  // Most popular first
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
  // Catch-all
  { value: "other", label: "Other" },
];

export default function SettingsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [healing, setHealing] = useState(false);

  async function ensureBiz() {
    setHealing(true);
    try {
      // Idempotent: creates profile.business_id and businesses row if missing
      await supabase.rpc("ensure_profile_and_business");
    } catch {
      // ignore; read will still run
    } finally {
      setHealing(false);
    }
  }

  async function load() {
    setLoading(true);
    setMsg(null);

    // self-heal first (fixes brand new accounts)
    await ensureBiz();

    // read the business row under RLS; don't throw on 0 rows
    const { data, error } = await supabase
      .from("businesses")
      .select("id,name,industry,is_mobile")
      .maybeSingle();

    if (error) {
      setMsg(error.message);
      setBiz(null);
    } else {
      setBiz((data as Biz) ?? null);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();

    // Realtime for businesses (keeps UI fresh)
    const ch = supabase
      .channel("rt-businesses")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "businesses" },
        () => load()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patch(updates: Partial<Biz>) {
    if (!biz) return;
    setMsg(null);
    const { error } = await supabase
      .from("businesses")
      .update(updates)
      .eq("id", biz.id);
    if (error) {
      setMsg(error.message);
      await load(); // revert local state on error
    } else {
      setBiz({ ...biz, ...updates });
    }
  }

  async function seedServices() {
    if (!biz) return;
    if (!biz.industry) {
      setMsg("Pick an industry first.");
      return;
    }
    setSeeding(true);
    setMsg(null);
    const { error } = await supabase.rpc("seed_services_for_business_id", {
      p_business: biz.id,
      p_industry: biz.industry,
    });
    setSeeding(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg("Seeded default services for your industry. You can adjust them in the Services list.");
  }

  if (loading) {
    return <div className="text-cx-muted">Loading…</div>;
  }

  // If still no row, show a small in-theme fix action (no redesign)
  if (!biz) {
    return (
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4 space-y-3">
        <div className="text-rose-400">No business found for this account.</div>
        <div className="text-cx-muted text-sm">
          Click fix, then refresh. If it persists, run the backfill SQL once.
        </div>
        <div className="flex gap-2">
          <button
            className="btn-pill btn-pill--active"
            onClick={async () => {
              await ensureBiz();
              await load();
            }}
            disabled={healing}
          >
            {healing ? "Fixing…" : "Fix now"}
          </button>
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
        {/* Link to Services list subpage */}
        <Link href="/settings/services" className="btn-pill btn-pill--active">
          Manage services →
        </Link>
      </div>

      {/* Business card */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4 space-y-4">
        <h2 className="font-semibold">Business</h2>

        {/* Business ID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-cx-muted mb-1">Business ID</div>
            <div className="flex items-center gap-2">
              <code className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border text-xs break-all">
                {biz.id}
              </code>
              <button
                className="btn-pill"
                onClick={() => navigator.clipboard.writeText(biz.id)}
              >
                Copy
              </button>
            </div>
          </div>

          {/* We go to the customer (mobile) */}
          <div>
            <div className="text-sm text-cx-muted mb-1">Visit type</div>
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {biz.is_mobile ? "We go to the customer" : "Customers come to us"}
              </span>
              <button
                className={`px-3 py-1.5 rounded-xl text-sm font-medium ${
                  biz.is_mobile
                    ? "bg-white/10 text-white"
                    : "bg-white/5 text-cx-muted border border-cx-border"
                }`}
                onClick={() => patch({ is_mobile: !biz.is_mobile })}
              >
                {biz.is_mobile ? "On-site (ON)" : "On-site (OFF)"}
              </button>
            </div>
            <div className="text-xs text-cx-muted mt-1">
              When ON, address fields show on New Appointment & tables.
            </div>
          </div>

          {/* Industry / niche */}
          <div>
            <div className="text-sm text-cx-muted mb-1">Industry / Niche</div>
            <select
              value={biz.industry ?? ""}
              onChange={(e) => patch({ industry: e.target.value || null })}
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none [color-scheme:dark]"
            >
              <option value="" className="text-black bg-white">
                Select an industry…
              </option>
              {INDUSTRIES.map((i) => (
                <option key={i.value} value={i.value} className="text-black bg-white">
                  {i.label}
                </option>
              ))}
            </select>
            <div className="text-xs text-cx-muted mt-1">
              This helps seed the right default services.
            </div>
          </div>
        </div>

        {/* Seed services */}
        <div className="pt-2">
          <button
            onClick={seedServices}
            disabled={seeding}
            className="btn-pill btn-pill--active"
          >
            {seeding ? "Seeding…" : "Seed default services for this industry"}
          </button>
        </div>

        {msg && <div className="text-rose-400 text-sm">{msg}</div>}
      </div>

      {/* Tip */}
      <div className="text-xs text-cx-muted">
        Need to edit individual services (price, duration, Cal Event Type)? Use{" "}
        <Link href="/settings/services" className="underline">Services</Link>.
      </div>
    </div>
  );
}
