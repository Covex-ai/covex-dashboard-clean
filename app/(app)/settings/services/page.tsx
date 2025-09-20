"use client";

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    const ch = supabase
      .channel("rt-services")
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function addService() {
    if (!biz) return;
    if (!newCode.trim() || !newName.trim()) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("services").insert({
      business_id: biz.id,
      code: newCode.trim().toUpperCase().replace(/\s+/g,"_"),
      name: newName.trim(),
      default_price_usd: parseUSD(newPrice),
      active: true,
    } as any);
    setBusy(false);
    if (error) setMsg(error.message);
    else { setNewCode(""); setNewName(""); setNewPrice("0"); load(); }
  }

  async function save(row: Service, patch: Partial<Service>) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("services").update(patch).eq("id", row.id);
    setBusy(false);
    if (error) setMsg(error.message);
  }

  return (
    <div className="space-y-6">
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
      </div>

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
                      onClick={()=>save(r, { active: !r.active })}
                      className={`btn-pill ${r.active ? "btn-pill--active" : ""}`}
                    >
                      {r.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={r.code}
                      onChange={(e)=>save(r, { code: e.target.value.toUpperCase().replace(/\s+/g,"_") })}
                      className="px-2 py-1 rounded-lg bg-cx-bg border border-cx-border text-xs outline-none w-40"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      value={r.name}
                      onChange={(e)=>save(r, { name: e.target.value })}
                      className="px-2 py-1 rounded-lg bg-cx-bg border border-cx-border text-xs outline-none w-64"
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      defaultValue={String(r.default_price_usd ?? 0)}
                      onBlur={(e)=>save(r, { default_price_usd: parseUSD(e.target.value) })}
                      className="px-2 py-1 rounded-lg bg-cx-bg border border-cx-border text-xs outline-none w-28"
                    />
                    <div className="text-xs text-cx-muted mt-1">
                      {fmtUSD(Number(r.default_price_usd))}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <button onClick={()=>save(r, { sort_order: (r.sort_order ?? 0) + 1 })} className="btn-pill">
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
