"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

export default function SettingsPage() {
  const sb = useMemo(() => createBrowserSupabaseClient(), []);
  const [email, setEmail] = useState<string>("");
  const [biz, setBiz] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: userData } = await sb.auth.getUser();
      if (userData?.user) {
        setEmail(userData.user.email ?? "");
        const { data } = await sb.from("profiles").select("business_id").eq("id", userData.user.id).maybeSingle();
        setBiz(data?.business_id ?? "");
      }
    })();
  }, [sb]);

  async function save() {
    setSaving(true); setMessage("");
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) { setMessage("Not signed in."); setSaving(false); return; }
    const { error } = await sb.from("profiles").upsert({ id: userData.user.id, business_id: biz }, { onConflict: "id" });
    setMessage(error ? "Error: " + error.message : "Saved!");
    setSaving(false);
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-3xl font-bold">Settings</h1>

      <div className="rounded border border-white/10 p-4 bg-covex-panel space-y-3">
        <div className="text-sm text-slate-400">Signed in as</div>
        <div className="text-lg">{email || "—"}</div>
      </div>

      <div className="rounded border border-white/10 p-4 bg-covex-panel space-y-3">
        <label className="text-sm text-slate-300">Business ID</label>
        <input
          value={biz} onChange={(e) => setBiz(e.target.value)}
          placeholder="daec3330-461e-4922-9cf9-65afd8f21c64"
          className="w-full bg-[#121a21] border border-white/10 rounded px-3 py-2 text-sm outline-none"
        />
        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          {message && <div className="text-sm text-slate-400 self-center">{message}</div>}
        </div>
        <div className="text-xs text-slate-500">
          Writes to your <code>profiles</code> row (column <code>business_id</code>).
        </div>
      </div>
    </div>
  );
}
