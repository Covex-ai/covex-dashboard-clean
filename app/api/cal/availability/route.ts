import { NextRequest, NextResponse } from "next/server";

const CAL_BASE = "https://api.cal.com/v2";

// Utilities
function isoDayRangeUTC(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  // Convert local wall clock to UTC ISO
  const startISO = new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString();
  const endISO = new Date(end.getTime() - end.getTimezoneOffset() * 60000).toISOString();
  return { startISO, endISO };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const eventTypeId = url.searchParams.get("eventTypeId"); // required
  const timeZone = url.searchParams.get("timeZone") ?? "America/New_York";
  const startQ = url.searchParams.get("start");
  const endQ = url.searchParams.get("end");
  const debug = url.searchParams.get("debug") === "1";

  if (!eventTypeId) {
    return NextResponse.json({ error: "Missing query param: eventTypeId" }, { status: 400 });
  }

  // If caller didn’t pass start/end, default to “today only”
  const today = new Date();
  const { startISO, endISO } = isoDayRangeUTC(today);
  const start = startQ ?? startISO;
  const end = endQ ?? endISO;

  try {
    const res = await fetch(
      `${CAL_BASE}/slots?eventTypeId=${encodeURIComponent(eventTypeId)}&start=${encodeURIComponent(
        start
      )}&end=${encodeURIComponent(end)}&timeZone=${encodeURIComponent(timeZone)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CALCOM_API_KEY ?? ""}`,
          // Use a widely deployed version for both slots & bookings unless you override via env
          "cal-api-version": process.env.CALCOM_API_VERSION_SLOTS ?? "2024-08-13",
        },
        cache: "no-store",
      }
    );

    const text = await res.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return NextResponse.json(
        { error: "Cal.com returned non-JSON", status: res.status, raw: text },
        { status: 502 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: json?.error ?? json, status: res.status, raw: debug ? json : undefined },
        { status: 502 }
      );
    }

    // Normalize slots: Cal sometimes returns { data:{ slots: [...] } } or { slots:[...] }
    let slots: string[] = [];
    const rawSlots = Array.isArray(json?.data?.slots) ? json.data.slots :
                     Array.isArray(json?.slots) ? json.slots : [];

    // Each slot can be an ISO string or { start, end }. Keep the start.
    slots = rawSlots
      .map((s: any) => (typeof s === "string" ? s : s?.start))
      .filter(Boolean);

    // Optional debug echo
    if (debug) {
      return NextResponse.json({
        info: {
          eventTypeId,
          timeZone,
          start,
          end,
          count: slots.length,
        },
        calRawKeys: Object.keys(json),
        slots,
        calRaw: json,
      });
    }

    return NextResponse.json({ slots });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to reach Cal.com", detail: String(err) },
      { status: 502 }
    );
  }
}
