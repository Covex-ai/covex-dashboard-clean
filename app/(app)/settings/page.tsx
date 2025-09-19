"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function SettingsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("-");
  const [businessUUID, setBusinessUUID] = useState<string>("");
  const [status, setStatus] = useState<string>("Loading...");
  const [stats, setStats] = useState<{ bookings: number; revenue: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      setUserId(user?.id ?? null);
      setEmail(user?.email ?? "-");
      if (!user) { setStatus("Not signed in"); return; }

      const { data: prof } = await supabase
        .from("profiles")
        .select("business_uuid")
        .eq("id", user.id)
        .maybeSingle();

      const bu = prof?.business_uuid ?? "";
      setBusinessUUID(bu);
      setStatus("Authenticated");
      if (bu) await refreshStats();
    })();
  }, []);

  async function refreshStats() {
    // With RLS, this only works for the current business_uuid in your profile
    const { data: appts } = await supabase
      .from("appointments")
      .select("status, price_usd, normalized_service, service_raw")
      .gte("start_ts", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString());

    const rows = (appts ?? []);
    let bookings = rows.length;
    let revenue = rows
      .filter((r: any) => r.status !== "Cancelled")
      .reduce((sum: number, r: any) => sum + Number(r.price_usd ?? 0), 0);

    setStats({ bookings, revenue });
  }

  async function saveBusinessId() {
    if (!userId) return;
    if (!isUUID(businessUUID)) {
      alert("Please paste a valid Business ID (UUID).");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ business_uuid: businessUUID })
      .eq("id", userId);

    setBusy(false);
    if (error) {
      alert(`Save failed: ${error.message}`);
    } else {
      alert("Business ID saved. Reloading stats for this business…");
      await refreshStats();
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Account</h3>
        <div className="text-sm text-cx-muted">Status</div>
        <div className="mb-4">{status}</div>
        <div className="text-sm text-cx-muted">Email</div>
        <div className="mb-4">{email}</div>

        <div className="text-sm text-cx-muted">Business ID (UUID)</div>
        <div className="flex gap-2 mt-1">
          <input
            value={businessUUID}
            onChange={(e) => setBusinessUUID(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="flex-1 px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
          />
          <button onClick={saveBusinessId} disabled={busy} className="btn-pill btn-pill--active">
            Save
          </button>
        </div>
        <p className="text-xs text-cx-muted mt-2">
          This stores your Business ID in <code className="text-white">profiles.business_uuid</code>.
          RLS uses it so all pages show **your** tenant’s data.
        </p>
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Overview (last 30d)</h3>
        {stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Stat label="Bookings" value={String(stats.bookings)} />
            <Stat label="Revenue (excl. Cancelled)" value={`$${Math.round(stats.revenue).toLocaleString()}`} />
          </div>
        ) : (
          <div className="text-cx-muted text-sm">No data yet or not loaded.</div>
        )}
        <button onClick={refreshStats} className="btn-pill mt-4">Refresh</button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-cx-bg border border-cx-border rounded-2xl p-4">
      <div className="text-cx-muted text-sm mb-1">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
