"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

/** Table types (minimal, enough for strict TS) */
type ProfileRow = { business_id: string | null };                // for SELECT
type ProfileUpsert = { id: string; business_id: string | null }; // for UPSERT

export default function SettingsPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState<string>("-");
  const [businessId, setBusinessId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;
      setEmail(userRes?.user?.email ?? "(not signed in)");
      if (!uid) return;

      // Typed SELECT to avoid `never` from maybeSingle()
      const { data, error } = await supabase
        .from<ProfileRow>("profiles")
        .select("business_id")
        .eq("id", uid)
        .maybeSingle();

      if (!error && data?.business_id) setBusinessId(data.business_id);
    })();
  }, [supabase]);

  async function save() {
    setSaving(true);
    setMsg("");

    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes?.user?.id ?? null;
    if (!uid) {
      setMsg("Sign in with Supabase Auth to save.");
      setSaving(false);
      return;
    }

    // Typed UPSERT so TS knows the payload shape
    const payload: ProfileUpsert = { id: uid, business_id: businessId || null };
    const { error } = await supabase
      .from<ProfileUpsert>("profiles")
      .upsert(payload);

    setMsg(error ? error.message : "Saved.");
    setSaving(false);
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="rounded-2xl bg-cx-surface border border-cx-border p-6 shadow-xl space-y-5">
        <div>
          <div className="text-sm text-cx-muted">Email</div>
          <div className="mt-1">{email}</div>
        </div>

        <div>
          <div className="text-sm text-cx-muted mb-1">Business ID (UUID)</div>
          <input
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            placeholder="11111111-1111-1111-1111-111111111111"
            className="w-full rounded-xl bg-cx-bg px-4 py-3 outline-none border border-cx-border text-cx-text placeholder:text-cx-muted"
          />
          <p className="text-xs text-cx-muted mt-2">
            Links your user to a business. All dashboard data is scoped by this value (via RLS).
          </p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="rounded-xl px-4 py-3 bg-cx-accent/90 hover:bg-cx-accent transition text-white font-medium disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>

        {msg && <div className="text-sm text-cx-muted">{msg}</div>}
      </div>
    </div>
  );
}
