import { NextRequest, NextResponse } from "next/server";

function toUTC(isoLike: string): string {
  const d = new Date(isoLike);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// If you renamed the phone booking question, change this slug:
const PHONE_FIELD_SLUG = "attendeePhoneNumber";

export async function POST(req: NextRequest) {
  const key = process.env.CAL_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing CAL_API_KEY on server." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { eventTypeId, startISO, name, email, phone, timeZone } = body || {};
  if (!eventTypeId || !startISO || !name || !email || !timeZone) {
    return NextResponse.json({ error: "eventTypeId, startISO, name, email, timeZone required" }, { status: 400 });
  }

  const payload: any = {
    start: toUTC(startISO),
    eventTypeId: Number(eventTypeId),
    attendee: {
      name,
      email,
      timeZone,
      phoneNumber: phone || undefined, // store on attendee too
      language: "en",
    },
    // <-- THIS is what triggers your SMS workflow by filling the booking question
    bookingFieldsResponses: phone ? { [PHONE_FIELD_SLUG]: phone } : undefined,
    // Optional: if you run “phone” location for this event type
    location: { type: "phone" },
    metadata: phone ? { phone } : undefined,
  };

  const res = await fetch("https://api.cal.com/v2/bookings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "cal-api-version": "2024-08-13",
    },
    body: JSON.stringify(payload),
  });

  let j: any = null;
  try { j = await res.json(); } catch {}

  if (!res.ok || j?.status === "error") {
    const msg = j?.error?.message || j?.error || j || "Cal.com booking failed";
    return NextResponse.json({ error: msg }, { status: res.status || 502 });
  }

  return NextResponse.json({ data: j.data ?? j });
}
