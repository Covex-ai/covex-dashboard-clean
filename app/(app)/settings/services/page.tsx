"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type ServiceRow = {
  id: number;
  name: string;
  code: string | null;
  active: boolean;
  slot_minutes: number | null;
  event_type_id: number | null;
  sort_order?: number | null;
};

export default function ServicesListPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [bizId, setBizId] = useState<string | null>(null);

  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const newNameRef = useRef<HTMLInputElement | null>(null);

  /* ---------------- helpers ---------------- */

  // “New patient exam – 60m” -> “NEW_PATIENT_EXAM_60M”
  function normalizeCode(s: string): string {
    return s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  }
  function nextUniqueCode(desired: string, id: number, list: { id: number; code: string | null }[]) {
    const base = normalizeCode(desired);
    const taken = new Set(list.filter(r => r.id !== id).map(r => (r.code ?? "").trim()));
    let out = base, i = 2;
    while (taken.has(out)) out = `${base}_${i++}`;
    return out;
  }

  async function loadBizId() {
    const { data, error } = await supabase.from("profiles").select("business_id").maybeSingle();
    if (error) { setMsg(error.message); return; }
    setBizId((data?.business_id as string) ?? null);
  }

  async function load() {
    if (!bizId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("services")
      .select("id,name,code,active,slot_minutes,event_type_id,sort_order")
      .eq("business_id", bizId)
      .order("sort_order", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true });

    if (error) setMsg(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => { loadBizId(); }, []);

  useEffect(() => {
    if (!bizId) return;
    load();

    // realtime only for my business rows
    const ch = supabase
      .channel("rt-services")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services", filter: `business_id=eq.${bizId}` },
        () => load()
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bizId]);

  function onLocalEdit(id: number, field: keyof ServiceRow, value: any) {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function savePatch(id: number, patch: Partial<ServiceRow>) {
    setSavingId(id);
    setMsg(null);

    // First attempt
    let { error } = await supabase.from("services").update(patch).eq("id", id);
    // If duplicate unique violation and we were changing code, auto-fix & retry
    if (error && (error as any).code === "23505" && patch.code != null) {
      const code2 = nextUniqueCode(String(patch.code), id, rows);
      const retry = await supabase.from("services").update({ ...patch, code: code2 }).eq("id", id);
      if (!retry.error) {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, code: code2 } : r)));
        setMsg(`Code already used. Saved as ${code2}.`);
        setSavingId(null);
        return;
      }
      error = retry.error;
    }

    setSavingId(null);
    if (error) {
      setMsg(error.message);
      await load(); // revert local state to server truth
    }
  }

  // DELETE with FK fallback (appointments.service_id -> NULL), no prompt
  async function handleDelete(row: ServiceRow) {
    setMsg(null);

    // optimistic UI
    const prev = rows;
    setRows(prev.filter(r => r.id !== row.id));

    // Try delete
    let del = await supabase.from("services").delete().eq("id", row.id);
    // If FK violation, null-out appointments.service_id then retry
    if (del.error && (del.error as any).code === "23503") {
      const fix = await supabase.from("appointments").update({ service_id: null }).eq("service_id", row.id);
      if (!fix.error) del = await supabase.from("services").delete().eq("id", row.id);
    }

    if (del.error) {
      // rollback UI and show error
      setRows(prev);
      setMsg(del.error.message);
    }
  }

  async function handleCreate() {
    if (!bizId) { setMsg("No business_id found. Reload the page and try again."); return; }
    setCreating(true);
    setMsg(null);

    const { data, error } = await supabase
      .from("services")
      .insert([{
        business_id: bizId,
        name: "New service",
        code: null,
        active: true,
        slot_minutes: 60,
        event_type_id: null,
        sort_order: (rows[0]?.sort_order ?? 0) - 1, // bubble to top
      }])
      .select("id,name,code,active,slot_minutes,event_type_id,sort_order")
      .single();

    setCreating(false);
    if (error) { setMsg(error.message); return; }
    if (data) {
      setRows(prev => [data as ServiceRow, ...prev]);
      setTimeout(() => newNameRef.current?.focus(), 50);
    }
  }

  /* ---------------- render ---------------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="btn-pill">← Settings</Link>
          <h1 className="text-lg font-semibold">Services</h1>
        </div>
        <button className="btn-pill btn-pill--active" onClick={handleCreate} disabled={!bizId || creating}>
          {creating ? "Creating…" : "+ New service"}
        </button>
      </div>

      {/* Table */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <p className="text-sm text-cx-muted mb-4">
          Edit <span className="text-white font-medium">Name</span> and <span className="text-white font-medium">Code</span>,
          toggle <span className="text-white font-medium">Active</span>, set
          <span className="text-white font-medium"> Slot (min)</span> and Cal.com
          <span className="text-white font-medium"> Event Type ID</span>. Use <span className="text-white font-medium">Delete</span> to remove a service.
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
              {rows.map((r, idx) => {
                const isNewTopRow = idx === 0 && r.name === "New service";
                return (
                  <tr key={r.id} className="border-top border-cx-border">
                    {/* Name */}
                    <td className="py-2 pr-4">
                      <input
                        ref={isNewTopRow ? newNameRef : undefined}
                        value={r.name}
                        onChange={(e) => onLocalEdit(r.id, "name", e.target.value)}
                        onBlur={async (e) => {
                          const nextName = e.target.value.trim() || "Untitled service";
                          const patch: Partial<ServiceRow> = { name: nextName };
                          if (!r.code || !r.code.trim()) patch.code = nextUniqueCode(nextName, r.id, rows);
                          await savePatch(r.id, patch);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="w-64 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none"
                        placeholder="Service name"
                      />
                    </td>

                    {/* Code */}
                    <td className="py-2 pr-4">
                      <input
                        value={r.code ?? ""}
                        onChange={(e) => onLocalEdit(r.id, "code", e.target.value.toUpperCase())}
                        onBlur={async (e) => {
                          const finalCode = nextUniqueCode(e.target.value, r.id, rows);
                          if (finalCode !== normalizeCode(e.target.value)) {
                            setMsg(`Code already used. Saved as ${finalCode}.`);
                          }
                          await savePatch(r.id, { code: finalCode });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        placeholder="E.g. ACUTE_30"
                        className="w-56 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none uppercase tracking-wide"
                      />
                    </td>

                    {/* Active toggle */}
                    <td className="py-2 pr-4">
                      <button
                        onClick={() => { onLocalEdit(r.id, "active", !r.active); savePatch(r.id, { active: !r.active }); }}
                        className={`px-2 py-1 rounded-xl text-xs font-medium ${
                          r.active ? "bg-white/10 text-white" : "bg-white/5 text-cx-muted border border-cx-border"
                        }`}
                        aria-pressed={r.active}
                      >
                        {r.active ? "Active" : "Inactive"}
                      </button>
                    </td>

                    {/* Slot (minutes) */}
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={r.slot_minutes ?? 60}
                        onChange={(e) => onLocalEdit(r.id, "slot_minutes", Number(e.target.value || 0))}
                        onBlur={(e) => savePatch(r.id, { slot_minutes: Number(e.target.value || 0) })}
                        className="w-28 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none"
                      />
                    </td>

                    {/* Cal.com event type ID */}
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        value={r.event_type_id ?? ""}
                        onChange={(e) => onLocalEdit(r.id, "event_type_id", e.target.value ? Number(e.target.value) : null)}
                        onBlur={(e) => savePatch(r.id, { event_type_id: e.target.value ? Number(e.target.value) : null })}
                        placeholder="e.g. 3274310"
                        className="w-40 px-3 py-1.5 rounded-xl bg-cx-bg border border-cx-border outline-none"
                      />
                    </td>

                    {/* Actions */}
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-3">
                        {savingId === r.id && <span className="text-xs text-cx-muted" aria-live="polite">Saving…</span>}
                        <button
                          onClick={() => handleDelete(r)}
                          className="px-2 py-1 rounded-xl text-xs font-medium bg-rose-600/20 text-rose-300 border border-rose-700/40"
                          title="Delete service"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && !loading && (
                <tr><td className="py-6 text-center text-cx-muted" colSpan={6}>No services found.</td></tr>
              )}
              {loading && (
                <tr><td className="py-6 text-center text-cx-muted" colSpan={6}>Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {msg && <div className="text-rose-400 text-sm mt-3">{msg}</div>}
      </div>
    </div>
  );
}
