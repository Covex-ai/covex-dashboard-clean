"use client";

import { useEffect, useState } from "react";

export default function DebugCalPage() {
  const [okJson, setOkJson] = useState<any>(null);
  const [eventTypeId, setEventTypeId] = useState<string>("");
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [timeZone, setTimeZone] = useState<string>(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
  const [result, setResult] = useState<{ status?: number; body?: any }>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/ok")
      .then(r => r.json())
      .then(setOkJson)
      .catch(() => setOkJson({ error: "failed" }));
  }, []);

  function toUTCStartEnd(dStr: string) {
    const d = new Date(`${dStr}T00:00:00`);
    const start = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
    const d2 = new Date(`${dStr}T23:59:59.999`);
    const end = new Date(d2.getTime() - d2.getTimezoneOffset() * 60000).toISOString();
    return { start, end };
  }

  async function testSlots() {
    setLoading(true);
    setResult({});
    try {
      const { start, end } = toUTCStartEnd(date);
      const qs = new URLSearchParams({
        eventTypeId: eventTypeId.trim(),
        start,
        end,
        timeZone,
      }).toString();
      const r = await fetch(`/api/cal/availability?${qs}`, { cache: "no-store" });
      const body = await r.json().catch(() => ({}));
      setResult({ status: r.status, body });
    } catch (e: any) {
      setResult({ status: 0, body: { error: String(e) } });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Cal.com Debug</h1>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4 space-y-2">
        <div className="text-sm text-cx-muted">/api/ok check</div>
        <pre className="text-xs overflow-auto bg-cx-bg border border-cx-border rounded-xl p-3">
{JSON.stringify(okJson, null, 2)}
        </pre>
      </div>

      <div className="bg-cx-surface border border-cx-border rounded-2xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm text-cx-muted mb-1">Event Type ID</label>
            <input
              value={eventTypeId}
              onChange={(e) => setEventTypeId(e.target.value)}
              placeholder="e.g. 3274310"
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-cx-muted mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-cx-muted mb-1">Time zone</label>
            <input
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-cx-bg border border-cx-border outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={testSlots}
            disabled={!eventTypeId.trim() || loading}
            className="btn-pill btn-pill--active"
          >
            {loading ? "Testing…" : "Test availability"}
          </button>
        </div>

        <div>
          <div className="text-sm text-cx-muted mb-1">Result</div>
          <pre className="text-xs overflow-auto bg-cx-bg border border-cx-border rounded-xl p-3">
{JSON.stringify(result, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
