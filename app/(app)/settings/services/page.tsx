"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type ServiceRow = {
  id: number;
  name: string;
  code: string | null;
  active: boolean;
  slot_minutes: number | null;
  event_type_id: number | null;
  sort_order?: number | null;
  business_id?: string; // returned for RLS guard on update
};

export default function ServicesListPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [bizId, setBizId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function fetchBizId() {
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    setBizId(data?.id ?? null);
    return data?.id ?? null;
  }

  async function load() {
    setLoading(true);
    setMsg(null);
    const id = bizId ?? (await fetchBizId());
    // RLS should already scope rows to current business, but we also return business_id for safe updates
    const { data, error } = await supabase
      .from("services")
      .select("id,name,code,active,slot_minutes,event_type_id,sort_order,business_id")
      .order("sort_order", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true });

    if (error) setMsg(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("rt-services")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services" },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizId]);

  async function savePatch(row: ServiceRow, patch: Partial<ServiceRow>) {
    setSavingId(row.id);
    setMsg(null);

    // Guard updates with BOTH id and business_id to satisfy strict RLS
    const { error } = await supabase
      .from("services")
      .update(patch)
      .eq("id", row.id)
      .eq("business_id", row.business_id || bizId || "");

    setSavingId(null);

    if (error) {
      setMsg(error.message);
      await load(); // revert on error to server truth
    }
  }

  function onLocalEdit(id: number, field: keyof ServiceRow, value: any) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="btn-pill">← Settings</Link>
          <h1 className="text-lg font-semibold">Services</h1>
        </div>
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <p className="text-sm text-cx-muted mb-4">
          Toggle <span className="text-white">Active</span>. Set <span className="text-white">Slot (min)</span> and Cal.com{" "}
          <span className="text-white">Event Type ID</span>. Changes save on click or when a field loses focus.
        </p>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-cx-muted">
              <tr className="text-left">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Active</th>
                <th className="py-2 pr-4">Slot (min)</th>
                <th className="py-2 pr-4">Cal Event Type ID</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-cx-border">
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4">{r.code ?? "-"}</td>
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => {
                        onLocalEdit(r.id, "active", !r.active);
                        savePatch(r, { active: !r.active });
                      }}
                      className={`px-2 py-1 rounded-xl text-xs font-medium ${
                        r.active ? "bg-white/10 text-white" : "bg-white/5 text-cx-muted border border-cx-border"
                      }`}
                      disabled={savingId === r.id}
                    >
                      {r.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={r.slot_minutes ?? 60}
                      onChange={(e) => onLocalEdit(r.id, "slot_minutes", Number(e.target.value || 0))}
                      onBlur={(e) => savePatch(r, { slot_minutes: Number(e.target.value || 0) })}
                      className="w-28 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      value={r.event_type_id ?? ""}
                      onChange={(e) => onLocalEdit(r.id, "event_type_id", e.target.value ? Number(e.target.value) : null)}
                      onBlur={(e) => savePatch(r, { event_type_id: e.target.value ? Number(e.target.value) : null })}
                      placeholder="e.g. 3274310"
                      className="w-40 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    {savingId === r.id && <span className="text-xs text-cx-muted">Saving…</span>}
                  </td>
                </tr>
              ))}

              {rows.length === 0 && !loading && (
                <tr>
                  <td className="py-6 text-center text-cx-muted" colSpan={6}>No services found.</td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td className="py-6 text-center text-cx-muted" colSpan={6}>Loading…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {msg && <div className="text-rose-400 text-sm mt-3">{msg}</div>}
      </div>
    </div>
  );
}
