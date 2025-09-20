"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type Business = { id: string; name: string | null; industry: string | null };

const INDUSTRIES = ["chiropractic", "plumbing", "hvac", "dentistry", "other"] as const;
type Industry = typeof INDUSTRIES[number];

export default function SettingsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [biz, setBiz] = useState<Business | null>(null);
  const [industry, setIndustry] = useState<Industry>("other");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from("businesses").select("id,name,industry").single();
    if (!error && data) {
      setBiz(data as Business);
      setIndustry(((data.industry as Industry) ?? "other"));
    }
  }

  useEffect(() => { load(); }, []);

  async function seed() {
    if (!biz) return;
    setBusy(true); setMsg(null);
    const { error: uErr } = await supabase
      .from("businesses").update({ industry }).eq("id", biz.id);
    const { error: sErr } = await supabase.rpc("seed_services_for_business_id", {
      p_business: biz.id,
      p_industry: industry,
    });
    setBusy(false);
    if (uErr || sErr) setMsg(uErr?.message ?? sErr?.message ?? "Failed to seed");
    else setMsg(`Seeded services for ${industry}`);
  }

  return (
    <div className="space-y-6">
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h2 className="font-semibold mb-2">Business</h2>
        {biz ? (
          <div className="text-sm">
            <div className="text-cx-muted">ID</div>
            <div className="mb-3 break-all">{biz.id}</div>
            <div className="flex items-center gap-3">
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
            {msg && <div className="mt-2 text-sm text-cx-muted">{msg}</div>}
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
          Add/edit your services per business (name, code, price, active). Seed once, then customize.
        </p>
      </div>
    </div>
  );
}
