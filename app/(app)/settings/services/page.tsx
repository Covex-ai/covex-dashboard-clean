"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabaseBrowser";

type Biz = { id: string };
type Service = {
  id: number;
  business_id: string;
  code: string;
  name: string;
  default_price_usd: string | number;
  active: boolean;
  sort_order: number | null;
};

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);
}
function parseUSD(input: string) {
  const n = Number(String(input).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function ServicesManagerPage() {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [rows, setRows] = useState<Service[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("0");

  async function load() {
    const b = await supabase.from("businesses").select("id").single();
    if (!b.error && b.data) setBiz({ id: b.data.id });

    const { data } = await supabase
      .from("services")
      .select("*")
      .order("active", { ascending: false })
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    setRows((data as Service[]) || []);
  }

  useEffect(() => { load(); }, []);

  // Realtime as a safety net (but UI updates immediately below)
  useEffect(() => {
    const ch = supabase
      .channel("rt-services")
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // --------- Helpers with optimistic UI updates ---------
  async function addService() {
    if (!biz) return;
    if (!newCode.trim() || !newName.trim()) return;
    setBusy(true); setMsg(null);
    const insert = {
      business_id: biz.id,
      code: newCode.trim().toUpperCase().replace(/\s+/g,"_"),
      name: newName.trim(),
      default_price_usd: parseUSD(newPrice),
      active: true,
    } as any;

    // optimistic: show it at the top while DB writes
    const tempId = Date.now() * -1;
    setRows(prev => [{ ...(insert as Service), id: tempId, sort_order: 0 }, ...prev]);

    const { data, error } = await supabase.from("services").insert(insert).select("*").single();
    setBusy(false);

    if (error) {
      setMsg(error.message);
      // revert optimistic row
      setRows(prev => prev.filter(r => r.id !== tempId));
    } else {
      // replace temp row with real row
      setRows(prev => prev.map(r => (r.id === tempId ? (data as Service) : r)));
      setNewCode(""); setNewName(""); setNewPrice("0");
    }
  }

  async function savePatch(id: number, patch: Partial<Service>) {
    // optimistic: update local state first
    setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("services").update(patch).eq("id", id);
    if (error) {
      setMsg(error.message);
      // fallback: reload from DB to ensure consistency
      load();
    }
  }

  function toggleActive(row: Service) {
    savePatch(row.id, { active: !row.active });
  }

  function updateCode(row: Service, val: string) {
    const code = val.toUpperCase().replace(/\s+/g, "_");
    savePatch(row.id, { code });
  }

  function updateName(row: Service, val: string) {
    savePatch(row.id, { name: val });
  }

  function updatePriceOnBlur(row: Service, val: string) {
    savePatch(row.id, { default_price_usd: parseUSD(val) });
  }

  function bumpDown(row: Service) {
    savePatch(row.id, { sort_order: (row.sort_order ?? 0) + 1 });
  }

  return (
    <div className="space-y-6">
      {/* Header with Back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="btn-pill">← Back</Link>
          <h1 className="text-lg font-semibold">Services</h1>
        </div>
      </div>

      {/* Add new service */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h2 className="font-semibold mb-3">Add service</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            placeholder="Code (e.g. DRAIN_CLEAN)"
            className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border text-sm outline-none"
            value={newCode}
            onChange={(e)=>setNewCode(e.target.value)}
          />
          <input
            placeholder="Name (display label)"
            className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border text-sm outline-none"
            value={newName}
            onChange={(e)=>setNewName(e.target.value)}
          />
          <input
            placeholder="$ Price"
            className="px-3 py-2 rounded-xl bg-cx-bg border border-cx-border text-sm outline-none"
            value={newPrice}
            onChange={(e)=>setNewPrice(e.target.value)}
          />
          <button onClick={addService} disabled={busy} className="btn-pill btn-pill--active">
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        {msg && <div className="text-sm text-rose-400 mt-2">{msg}</div>}
        <p className="text-xs text-cx-muted mt-3">
          <strong>Active</strong> = on your menu for new bookings. <strong>Inactive</strong> = hidden from new bookings (old appointments stay the same).
        </p>
      </div>

      {/* List + edit services */}
      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <h2 className="font-semibold mb-3">Your services</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-cx-muted">
              <tr className="text-left">
                <th className="py-2 pr-4">Active</th>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Default Price</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-cx-border">
                  <td className="py-2 pr-4">
                    <button
                      onClick={() => toggleActive(r)}
                      className={`btn-pill ${r.active ? "btn-pill--active" : ""}`}
                      title={r.active ? "Click to hide from new bookings" : "Click to show in new bookings"}
                    >
                      {r.active ? "Active" : "Inactive"}
                    </button>
                  </td>

                  <td className="py-2 pr-4">
                    <input
                      value={r.code}
                      onChange={(e)=>updateCode(r, e.target.value)}
                      className="px-2 py-1 rounded-lg bg-cx-bg border border-cx-border text-xs outline-none w-40"
                    />
                  </td>

                  <td className="py-2 pr-4">
                    <input
                      value={r.name}
                      onChange={(e)=>updateName(r, e.target.value)}
                      className="px-2 py-1 rounded-lg bg-cx-bg border border-cx-border text-xs outline-none w-64"
                    />
                  </td>

                  <td className="py-2 pr-4">
                    <input
                      defaultValue={String(r.default_price_usd ?? 0)}
                      onBlur={(e)=>updatePriceOnBlur(r, e.target.value)}
                      className="px-2 py-1 rounded-lg bg-cx-bg border border-cx-border text-xs outline-none w-28"
                    />
                    <div className="text-xs text-cx-muted mt-1">
                      {fmtUSD(Number(r.default_price_usd))}
                    </div>
                  </td>

                  <td className="py-2 pr-4">
                    <button
                      onClick={()=>bumpDown(r)}
                      className="btn-pill"
                      title="Nudge down in lists"
                    >
                      Bump down
                    </button>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-cx-muted">
                    No services yet. Use “Add service” above or go to Settings → Business → Seed services.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
