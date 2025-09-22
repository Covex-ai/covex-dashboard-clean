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

export async function GET(req: NextRequest) {
  const key = process.env.CAL_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing CAL_API_KEY on server." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const eventTypeId = searchParams.get("eventTypeId");
  const date = searchParams.get("date"); // YYYY-MM-DD
  const timeZone = searchParams.get("timeZone") || "America/New_York";
  if (!eventTypeId || !date) {
    return NextResponse.json({ error: "eventTypeId and date are required" }, { status: 400 });
  }

  // Day bounds (UTC)
  const startISO = `${date}T00:00:00.000Z`;
  const endISO   = `${date}T23:59:59.999Z`;

  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const attempts: Attempt[] = [];

  // 1) Discover metadata for this Event Type (to get username / organization)
  let username: string | null = null;
  let organizationSlug: string | null = null;

  {
    const { res, body } = await jfetch(`https://api.cal.com/v2/event-types/${eventTypeId}`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    attempts.push({ method: "GET", url: `https://api.cal.com/v2/event-types/${eventTypeId}`, status: res.status, body });
    if (res.ok && body) {
      // Cal commonly returns owner info under user/team/organization
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

  // 2) Try several known, versioned endpoints/shapes (GET & POST), progressively adding discovered params
  const candidates = [
    // v2 availability GET
    {
      method: "GET",
      url: "https://api.cal.com/v2/availability/slots",
      qs: { eventTypeId: String(eventTypeId), start: startISO, end: endISO, timeZone },
    },
    // v2 availability GET with username
    {
      method: "GET",
      url: "https://api.cal.com/v2/availability/slots",
      qs: { eventTypeId: String(eventTypeId), start: startISO, end: endISO, timeZone, ...(username ? { username } : {}) },
    },
    // v2 availability GET with organization
    {
      method: "GET",
      url: "https://api.cal.com/v2/availability/slots",
      qs: { eventTypeId: String(eventTypeId), start: startISO, end: endISO, timeZone, ...(organizationSlug ? { organizationSlug } : {}) },
    },
    // v2 availability GET with startTime/endTime (some tenants require these names)
    {
      method: "GET",
      url: "https://api.cal.com/v2/availability/slots",
      qs: { eventTypeId: String(eventTypeId), startTime: startISO, endTime: endISO, timeZone, ...(username ? { username } : {}) , ...(organizationSlug ? { organizationSlug } : {}) },
    },
    // POST variants
    {
      method: "POST",
      url: "https://api.cal.com/v2/availability/slots",
      body: { eventTypeId: Number(eventTypeId), start: startISO, end: endISO, timeZone, ...(username ? { username } : {}), ...(organizationSlug ? { organizationSlug } : {}) },
    },
    {
      method: "POST",
      url: "https://api.cal.com/v2/availability/slots",
      body: { eventTypeId: Number(eventTypeId), startTime: startISO, endTime: endISO, timeZone, ...(username ? { username } : {}), ...(organizationSlug ? { organizationSlug } : {}) },
    },
    // Some older tenants expose this:
    {
      method: "GET",
      url: `https://api.cal.com/v2/event-types/${eventTypeId}/slots`,
      qs: { start: startISO, end: endISO, timeZone },
    },
  ];

  for (const c of candidates) {
    const qs = c.qs ? `?${new URLSearchParams(c.qs as Record<string,string>).toString()}` : "";
    const init: RequestInit = {
      method: c.method,
      headers,
      cache: "no-store",
      ...(c.body ? { body: JSON.stringify(c.body) } : {}),
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
      discovered: { username, organizationSlug },
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
