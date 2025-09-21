export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const CAL_BASE = "https://api.cal.com/v2";

// Convert local day to UTC ISO range
function dayRangeUTC(dateISO?: string) {
  const src = dateISO ? new Date(dateISO) : new Date();
  const start = new Date(src);
  start.setHours(0, 0, 0, 0);
  const end = new Date(src);
  end.setHours(23, 59, 59, 999);

  const startISO = new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString();
  const endISO = new Date(end.getTime() - end.getTimezoneOffset() * 60000).toISOString();
  return { startISO, endISO };
}

function normalizeSlots(json: any): string[] {
  // v2 usually returns { data: { slots: [{start, end}, ...] } }
  const raw =
    Array.isArray(json?.data?.slots)
      ? json.data.slots
      : Array.isArray(json?.slots)
      ? json.slots
      : [];

  return raw
    .map((s: any) => (typeof s === "string" ? s : s?.start))
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const eventTypeId = url.searchParams.get("eventTypeId");
  const timeZone = url.searchParams.get("timeZone") ?? "America/New_York";
  const startQ = url.searchParams.get("start");
  const endQ = url.searchParams.get("end");

  if (!eventTypeId) {
    return NextResponse.json({ error: "Missing eventTypeId" }, { status: 400 });
  }
  if (!process.env.CALCOM_API_KEY) {
    return NextResponse.json({ error: "CALCOM_API_KEY missing" }, { status: 500 });
  }

  const { startISO, endISO } = dayRangeUTC();
  const start = startQ ?? startISO;
  const end = endQ ?? endISO;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
    "cal-api-version": process.env.CALCOM_API_VERSION_SLOTS ?? "2024-08-13",
  };

  // 1) Preferred: POST /v2/availability/slots
  try {
    const r = await fetch(`${CAL_BASE}/availability/slots`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        eventTypeId: Number(eventTypeId),
        start, // ISO
        end,   // ISO
        timeZone,
      }),
    });

    const txt = await r.text();
    const json = txt ? JSON.parse(txt) : {};

    if (r.ok) {
      const slots = normalizeSlots(json);
      return NextResponse.json({ slots, via: "POST /availability/slots" });
    }

    // If POST not supported in your plan/version, fall through to GET fallback
  } catch (e) {
    // swallow and try fallback
  }

  // 2) Fallback: GET /v2/event-types/{id}/slots?start=...&end=...&timeZone=...
  try {
    const r2 = await fetch(
      `${CAL_BASE}/event-types/${encodeURIComponent(
        eventTypeId
      )}/slots?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&timeZone=${encodeURIComponent(
        timeZone
      )}`,
      { headers, cache: "no-store" }
    );
    const txt2 = await r2.text();
    const json2 = txt2 ? JSON.parse(txt2) : {};

    if (!r2.ok) {
      return NextResponse.json(
        { error: json2, status: r2.status, tried: ["POST /availability/slots", "GET /event-types/{id}/slots"] },
        { status: 502 }
      );
    }

    const slots = normalizeSlots(json2);
    return NextResponse.json({ slots, via: "GET /event-types/{id}/slots" });
  } catch (e: any) {
    return NextResponse.json(
      {
        error: String(e),
        tried: ["POST /availability/slots", "GET /event-types/{id}/slots"],
      },
      { status: 502 }
    );
  }
}
