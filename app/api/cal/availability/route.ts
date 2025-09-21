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

  try {
    const res = await fetch(
      `${CAL_BASE}/slots?eventTypeId=${encodeURIComponent(eventTypeId)}&start=${encodeURIComponent(
        start
      )}&end=${encodeURIComponent(end)}&timeZone=${encodeURIComponent(timeZone)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
          "cal-api-version": process.env.CALCOM_API_VERSION_SLOTS ?? "2024-08-13",
        },
        cache: "no-store",
      }
    );

    const txt = await res.text();
    const json = txt ? JSON.parse(txt) : {};
    if (!res.ok) return NextResponse.json({ error: json, status: res.status }, { status: 502 });

    const rawSlots = Array.isArray(json?.data?.slots)
      ? json.data.slots
      : Array.isArray(json?.slots)
      ? json.slots
      : [];

    const slots: string[] = rawSlots
      .map((s: any) => (typeof s === "string" ? s : s?.start))
      .filter(Boolean);

    return NextResponse.json({ slots });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
