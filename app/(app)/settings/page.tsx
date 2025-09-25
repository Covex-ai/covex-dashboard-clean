"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type Biz = {
  id: string;
  name: string | null;
  is_mobile: boolean;
};

export default function SettingsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Ensure profile + business row exists (safe to call repeatedly) */
  async function ensureBiz() {
    try {
      await supabase.rpc("ensure_profile_and_business");
    } catch (e: any) {
      // If this fails due to RLS or function missing, we'll still try to read below.
      console.warn("ensure_profile_and_business:", e?.message);
    }
  }

  async function readBiz() {
    setLoading(true);
    setMsg(null);
    await ensureBiz();
    const { data, error } = await supabase
      .from("businesses")
      .select("id,name,is_mobile")
      .maybeSingle();
    if (error) setMsg(error.message);
    setBiz((data as Biz) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    readBiz();
  }, []);

  /** Realtime only for the current business row */
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
    // IMPORTANT: do not return a Promise from cleanup
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz?.id]);

  /** Toggle visit type with optimistic UI and clear error handling */
  async function toggleVisitType() {
    if (!biz) return;
    setMsg(null);
    const next = !biz.is_mobile;

    // Optimistic update for snappy UI
    setBiz({ ...biz, is_mobile: next });
    setSaving(true);

    const { error } = await supabase
      .from("businesses")
      .update({ is_mobile: next })
      .eq("id", biz.id);

    setSaving(false);

    if (error) {
      // Revert + show error
      setBiz({ ...biz, is_mobile: !next });
      setMsg(`Could not update visit type: ${error.message}`);
      console.error("Visit type update error:", error);
    }
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
          {/* Business ID */}
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
                  biz.is_mobile
                    ? "bg-white/10 text-white"
                    : "bg-white/5 text-cx-muted border border-cx-border"
                }`}
                onClick={toggleVisitType}
              >
                {biz.is_mobile ? "On-site (ON)" : "On-site (OFF)"}
              </button>
            </div>
            <div className="text-xs text-cx-muted mt-1">
              When ON, address fields show on New Appointment & tables.
            </div>
            {saving && <div className="text-xs text-cx-muted mt-1">Saving…</div>}
          </div>

          {/* (Industry/Niche removed as requested) */}
        </div>

        {msg && <div className="text-rose-400 text-sm">{msg}</div>}
      </div>
    </div>
  );
}
