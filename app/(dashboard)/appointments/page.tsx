"use client";
import { useMemo } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";

export default function Appointments() {
  const sb = useMemo(() => createBrowserSupabaseClient(), []);
  // TODO: paste your working appointments page here, keeping the import above.
  return <div className="space-y-4">
    <h1 className="text-3xl font-bold">Appointments</h1>
    <div className="rounded border border-white/10 bg-covex-panel p-4">Wire data here.</div>
  </div>;
}
