import { NextRequest, NextResponse } from "next/server";

type TryPlan = {
  url: string;
  method?: "GET" | "POST";
  qs?: Record<string, string>;
  body?: any;
  pick: (j: any) => string[] | null;
};

async function fetchJSON(input: string, init: RequestInit) {
  const res = await fetch(input, init);
  const ct = res.headers.get("content-type") || "";
  let body: any = null;
  try {
    body = ct.includes("application/json") ? await res.json() : await res.text();
  } catch {
    body = await res.text().catch(() => null);
  }
  return { res, body };
}

function normalizeSlots(raw: any): string[] {
  const out: string[] = [];
  const arr = Array.isArray(raw) ? raw : [];
  for (const s of arr) {
    const iso =
      typeof s === "string"
        ? s
        : s?.start ||
          s?.startTime ||
          s?.utcStart ||
          s?.time ||
          (s?.slot && (s.slot.start || s.slot.startTime || s.slot.utcStart));
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

  // Build day bounds in UTC
  const startISO = `${date}T00:00:00.000Z`;
  const endISO = `${date}T23:59:59.999Z`;

  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  // We’ll try several endpoints Cal.com has used across versions/plans.
  const tries: TryPlan[] = [
    // Your original guess (some workspaces have it):
    {
      url: `https://api.cal.com/v2/event-types/${eventTypeId}/slots`,
      method: "GET",
      qs: { start: startISO, end: endISO, timeZone },
      pick: (j) => normalizeSlots(j?.data ?? j?.slots ?? j),
    },
    // Common v2 availability route (eventTypeId as query):
    {
      url: `https://api.cal.com/v2/availability/slots`,
      method: "GET",
      qs: { eventTypeId: String(eventTypeId), start: startISO, end: endISO, timeZone },
      pick: (j) => normalizeSlots(j?.data ?? j?.slots ?? j),
    },
    // Same route but with startTime/endTime param names:
    {
      url: `https://api.cal.com/v2/availability/slots`,
      method: "GET",
      qs: { eventTypeId: String(eventTypeId), startTime: startISO, endTime: endISO, timeZone },
      pick: (j) => normalizeSlots(j?.data ?? j?.slots ?? j),
    },
    // Some tenants expose a POST shape:
    {
      url: `https://api.cal.com/v2/availability/slots`,
      method: "POST",
      body: { eventTypeId: Number(eventTypeId), start: startISO, end: endISO, timeZone },
      pick: (j) => normalizeSlots(j?.data ?? j?.slots ?? j),
    },
    // And with startTime/endTime in POST:
    {
      url: `https://api.cal.com/v2/availability/slots`,
      method: "POST",
      body: { eventTypeId: Number(eventTypeId), startTime: startISO, endTime: endISO, timeZone },
      pick: (j) => normalizeSlots(j?.data ?? j?.slots ?? j),
    },
  ];

  const attempts: Array<{ url: string; method: string; status: number; body: any }> = [];

  for (const plan of tries) {
    const qs = plan.qs
      ? "?" + new URLSearchParams(plan.qs).toString()
      : "";
    const init: RequestInit = {
      method: plan.method || "GET",
      headers,
      cache: "no-store",
      ...(plan.body ? { body: JSON.stringify(plan.body) } : {}),
    };

    const { res, body } = await fetchJSON(plan.url + qs, init);
    attempts.push({ url: plan.url + qs, method: init.method!, status: res.status, body });

    if (res.ok) {
      const slots = plan.pick(body) || [];
      return NextResponse.json({ slots });
    }
  }

  // None worked — return a diagnostic so you can see what Cal.com returned.
  return NextResponse.json(
    {
      error: "Cal.com availability failed; tried multiple endpoints.",
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
