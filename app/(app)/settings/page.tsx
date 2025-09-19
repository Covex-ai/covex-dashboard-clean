"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

export default function SettingsPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [businessUUID, setBusinessUUID] = useState<string>("-");
  const [email, setEmail] = useState<string>("-");
  const [auth, setAuth] = useState<string>("Checking...");

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;
      setAuth(user ? "Authenticated" : "Not signed in");
      setEmail(user?.email ?? "-");

      if (user) {
        const { data } = await supabase.from("profiles").select("business_uuid").eq("id", user.id).maybeSingle();
        if (data?.business_uuid) setBusinessUUID(data.business_uuid);
      }
    })();
  }, []);

  async function insertTestAppointment() {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 60 * 1000);
    const { data, error } = await supabase.from("appointments").insert({
      business_uuid: businessUUID,
      start_ts: now.toISOString(),
      end_ts: in30.toISOString(),
      name: "Realtime Test",
      phone: "+10000000000",
      status: "Booked",
      service_raw: "Standard adjustment",
      price_usd: 85
    }).select().single();
    alert(error ? `Insert failed: ${error.message}` : `Inserted id ${data?.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Account</h3>
        <div className="text-sm text-cx-muted">Auth status</div>
        <div className="mb-4">{auth}</div>
        <div className="text-sm text-cx-muted">Email</div>
        <div className="mb-4">{email}</div>
        <div className="text-sm text-cx-muted">Business UUID</div>
        <div className="mb-2">{businessUUID}</div>
        <button
          onClick={insertTestAppointment}
          className="btn-pill btn-pill--active mt-2"
        >
          Insert test appointment (verify Realtime)
        </button>
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h3 className="font-semibold mb-2">Theme</h3>
        <p className="text-cx-muted text-sm">
          This dashboard enforces a pure black background (#000000) and white UI tokens.
          Avoid custom colors; use provided CSS variables/classes.
        </p>
      </div>
    </div>
  );
}
