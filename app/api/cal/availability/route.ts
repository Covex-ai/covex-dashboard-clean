import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const key = process.env.CAL_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Missing CAL_API_KEY on server." }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const eventTypeId = searchParams.get("eventTypeId");
  const date = searchParams.get("date"); // YYYY-MM-DD (local day)
  const timeZone = searchParams.get("timeZone") || "America/New_York";

  if (!eventTypeId || !date) {
    return NextResponse.json({ error: "eventTypeId and date are required" }, { status: 400 });
  }

  // Make a day window in the user's timezone
  const startISO = `${date}T00:00:00.000`;
  const endISO = `${date}T23:59:59.999`;

  const url = new URL(`https://api.cal.com/v2/event-types/${eventTypeId}/slots`);
  url.searchParams.set("start", startISO);
  url.searchParams.set("end", endISO);
  url.searchParams.set("timeZone", timeZone);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { error: body?.error || body || "Cal.com availability failed" },
      { status: 502 }
    );
  }

  // Normalize to array of ISO strings for the UI
  const raw = (body?.data ?? body?.slots ?? []) as any[];
  const slots: string[] = [];
  for (const s of raw) {
    const iso =
      typeof s === "string"
        ? s
        : s?.start || s?.startTime || s?.utcStart || s?.time || null;
    if (iso && !Number.isNaN(Date.parse(iso))) slots.push(iso);
  }

  return NextResponse.json({ slots });
}
