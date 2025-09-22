"use client";

import { useState } from "react";

const defaultTz = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York"; }
  catch { return "America/New_York"; }
})();

function toYMD(input: string): string {
  if (!input) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function CalDebugPage() {
  const [eventTypeId, setEventTypeId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tz, setTz] = useState(defaultTz);
  const [ok, setOk] = useState<any>(null);
  const [who, setWho] = useState<any>(null);
  const [etype, setEtype] = useState<any>(null);
  const [out, setOut] = useState<any>(null);

  async function pingOk() {
    const r = await fetch("/api/ok");
    setOk(await r.json());
  }

  async function getWhoAmI() {
    const r = await fetch("/api/cal/whoami");
    setWho(await r.json());
  }

  async function getEventType() {
    const id = String(eventTypeId || "").trim();
    const r = await fetch(`/api/cal/event-type?id=${encodeURIComponent(id)}`);
    setEtype(await r.json());
  }

  async function testAvail() {
    const id = String(eventTypeId || "").trim();
    const ymd = toYMD(date);
    const usp = new URLSearchParams({
      eventTypeId: id,
      date: ymd,
      timeZone: tz,
    });
    const r = await fetch(`/api/cal/availability?${usp}`);
    setOut({ status: r.status, body: await r.json() });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cal.com Debug</h1>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">/api/ok check</div>
          <button className="btn-pill" onClick={pingOk}>Run</button>
        </div>
        <pre className="text-xs bg-cx-bg border border-cx-border rounded-xl p-3 overflow-x-auto">
{JSON.stringify(ok, null, 2)}
        </pre>
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">/api/cal/whoami</div>
          <button className="btn-pill" onClick={getWhoAmI}>Run</button>
        </div>
        <pre className="text-xs bg-cx-bg border border-cx-border rounded-xl p-3 overflow-x-auto">
{JSON.stringify(who, null, 2)}
        </pre>
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <div className="text-sm text-cx-muted mb-1">Event Type ID</div>
            <input
              className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={eventTypeId}
              onChange={(e)=>setEventTypeId(e.target.value)}
            />
          </div>
          <div>
            <div className="text-sm text-cx-muted mb-1">Date</div>
            <input
              type="date"
              className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={date}
              onChange={(e)=>setDate(e.target.value)}
            />
          </div>
          <div>
            <div className="text-sm text-cx-muted mb-1">Time zone</div>
            <input
              className="w-full bg-cx-bg border border-cx-border rounded-xl px-3 py-2"
              value={tz}
              onChange={(e)=>setTz(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button className="btn-pill" onClick={getEventType}>Get Event Type</button>
          <button className="btn-pill btn-pill--active" onClick={testAvail}>Test availability</button>
        </div>

        <pre className="text-xs bg-cx-bg border border-cx-border rounded-xl p-3 overflow-x-auto mt-3">
{JSON.stringify(etype, null, 2)}
        </pre>

        <pre className="text-xs bg-cx-bg border border-cx-border rounded-xl p-3 overflow-x-auto mt-3">
{JSON.stringify(out, null, 2)}
        </pre>
      </div>
    </div>
  );
}
