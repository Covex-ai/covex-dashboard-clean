import { NextRequest, NextResponse } from "next/server";

function toUTC(isoLike: string): string {
  const d = new Date(isoLike); // handles offsets like +02:00
  return d.toISOString().replace(/\.\d{3}Z$/, "Z"); // trim ms, keep Z
}

export async function POST(req: NextRequest) {
  const key = process.env.CAL_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing CAL_API_KEY on server." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { eventTypeId, startISO, name, email, phone, timeZone } = body || {};
  if (!eventTypeId || !startISO || !name || !email || !timeZone) {
    return NextResponse.json({ error: "eventTypeId, startISO, name, email, timeZone required" }, { status: 400 });
  }

  const payload = {
    start: toUTC(startISO),              // Cal requires UTC
    attendee: {
      name,
      email,
      timeZone,
      phoneNumber: phone ?? undefined,   // Cal expects phone under attendee.phoneNumber
    },
    eventTypeId: Number(eventTypeId),
    metadata: phone ? { phone } : undefined,
  };

  const res = await fetch("https://api.cal.com/v2/bookings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "cal-api-version": "2024-08-13",  // REQUIRED for /v2/bookings
    },
    body: JSON.stringify(payload),
  });

  let j: any = null;
  try { j = await res.json(); } catch {}

  if (!res.ok || j?.status === "error") {
    const msg = j?.error?.message || j?.error || j || "Cal.com booking failed";
    return NextResponse.json({ error: msg }, { status: res.status || 502 });
  }

  // j.data is the booking
  return NextResponse.json({ data: j.data ?? j });
}
