import { NextRequest, NextResponse } from "next/server";

type Attempt = { method: string; url: string; status: number; body: any };

async function jfetch(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const ct = res.headers.get("content-type") || "";
  let body: any = null;
  try {
    body = ct.includes("application/json") ? await res.json() : await res.text();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { res, body };
}

function normSlots(raw: any): string[] {
  const arr = Array.isArray(raw) ? raw : (raw?.data ?? raw?.slots ?? []);
  const out: string[] = [];
  for (const s of arr) {
    const iso =
      typeof s === "string"
        ? s
        : s?.start || s?.startTime || s?.utcStart || s?.time || s?.slot?.start || s?.slot?.startTime;
    if (iso && !Number.isNaN(Date.parse(iso))) out.push(iso);
  }
  return out;
}

function toYMD(input: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export async function GET(req: NextRequest) {
  const key = process.env.CAL_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing CAL_API_KEY on server." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const eventTypeId = (searchParams.get("eventTypeId") || "").trim();
  const ymd = toYMD(searchParams.get("date"));
  const timeZone = (searchParams.get("timeZone") || "America/New_York").trim();

  if (!eventTypeId || !ymd) {
    return NextResponse.json({ error: "eventTypeId and date are required" }, { status: 400 });
  }

  // Day bounds (UTC)
  const startISO = `${ymd}T00:00:00.000Z`;
  const endISO   = `${ymd}T23:59:59.999Z`;

  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const attempts: Attempt[] = [];

  // ---- Discover owner/org of the event type (improves odds on multi-tenant setups)
  let username: string | null = null;
  let organizationSlug: string | null = null;

  {
    const etURL = `https://api.cal.com/v2/event-types/${eventTypeId}`;
    const { res, body } = await jfetch(etURL, { method: "GET", headers, cache: "no-store" });
    attempts.push({ method: "GET", url: etURL, status: res.status, body });
    if (res.ok && body) {
      username =
        body?.data?.owner?.username ??
        body?.data?.user?.username ??
        body?.owner?.username ??
        body?.user?.username ??
        null;
      organizationSlug =
        body?.data?.organization?.slug ??
        body?.data?.team?.slug ??
        body?.organization?.slug ??
        body?.team?.slug ??
        null;
    }
  }

  // ---- Try supported endpoints/param shapes
  const candidates = [
    { method: "GET", url: "https://api.cal.com/v2/availability/slots", qs: { eventTypeId, start: startISO, end: endISO, timeZone } },
    { method: "GET", url: "https://api.cal.com/v2/availability/slots", qs: { eventTypeId, start: startISO, end: endISO, timeZone, ...(username ? { username } : {}) } },
    { method: "GET", url: "https://api.cal.com/v2/availability/slots", qs: { eventTypeId, start: startISO, end: endISO, timeZone, ...(organizationSlug ? { organizationSlug } : {}) } },
    { method: "GET", url: "https://api.cal.com/v2/availability/slots", qs: { eventTypeId, startTime: startISO, endTime: endISO, timeZone, ...(username ? { username } : {}), ...(organizationSlug ? { organizationSlug } : {}) } },
    { method: "POST", url: "https://api.cal.com/v2/availability/slots", body: { eventTypeId: Number(eventTypeId), start: startISO, end: endISO, timeZone, ...(username ? { username } : {}), ...(organizationSlug ? { organizationSlug } : {}) } },
    { method: "POST", url: "https://api.cal.com/v2/availability/slots", body: { eventTypeId: Number(eventTypeId), startTime: startISO, endTime: endISO, timeZone, ...(username ? { username } : {}), ...(organizationSlug ? { organizationSlug } : {}) } },
    { method: "GET", url: `https://api.cal.com/v2/event-types/${eventTypeId}/slots`, qs: { start: startISO, end: endISO, timeZone } }, // legacy
  ] as const;

  for (const c of candidates) {
    const qs = (c as any).qs ? `?${new URLSearchParams((c as any).qs).toString()}` : "";
    const init: RequestInit = {
      method: c.method,
      headers,
      cache: "no-store",
      ...((c as any).body ? { body: JSON.stringify((c as any).body) } : {}),
    };
    const { res, body } = await jfetch(c.url + qs, init);
    attempts.push({ method: c.method, url: c.url + qs, status: res.status, body });
    if (res.ok) {
      const slots = normSlots(body);
      return NextResponse.json({ slots });
    }
  }

  return NextResponse.json(
    {
      error: "Cal.com availability failed after discovery attempts.",
      discovered: { username, organizationSlug, date: ymd, timeZone },
      attempts: attempts.map((a) => ({
        method: a.method,
        url: a.url,
        status: a.status,
        body: typeof a.body === "string" ? a.body.slice(0, 400) : a.body,
      })),
    },
    { status: 502 }
  );
}
