import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const key = process.env.CAL_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Missing CAL_API_KEY on server." }, { status: 500 });
  }

  const { eventTypeId, startISO, name, email, timeZone, phone } = await req.json();

  if (!eventTypeId || !startISO || !name || !email) {
    return NextResponse.json(
      { error: "eventTypeId, startISO, name and email are required" },
      { status: 400 }
    );
  }

  // Do NOT send lengthInMinutes unless your event type supports multiple lengths
  const payload = {
    eventTypeId,
    start: startISO,
    name,
    email,
    timeZone: timeZone || "America/New_York",
    metadata: { phone },
  };

  const res = await fetch("https://api.cal.com/v2/bookings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: body?.error || body || "Cal.com booking failed" }, { status: 502 });
  }

  return NextResponse.json({ data: body });
}
