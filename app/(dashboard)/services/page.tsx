"use client";
import { useMemo } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

export default function Services() {
  const sb = useMemo(() => createBrowserSupabaseClient(), []);
  // TODO: paste your services code here (keep import).
  return <div className="space-y-4">
    <h1 className="text-3xl font-bold">Services</h1>
    <div className="rounded border border-white/10 bg-covex-panel p-4">Top services, revenue, etc.</div>
  </div>;
}
