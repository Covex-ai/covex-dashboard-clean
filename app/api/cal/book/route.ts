import { NextRequest, NextResponse } from "next/server";

function toUTC(isoLike: string): string {
  const d = new Date(isoLike);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// If your phone booking question uses a different slug, change this:
const PHONE_FIELD_SLUG = "attendeePhoneNumber";

export async function POST(req: NextRequest) {
  const key = process.env.CAL_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing CAL_API_KEY on server." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const { eventTypeId, startISO, name, email, phone, timeZone } = body || {};
  if (!eventTypeId || !startISO || !name || !email || !timeZone) {
    return NextResponse.json({ error: "eventTypeId, startISO, name, email, timeZone required" }, { status: 400 });
  }

  // ✅ Do NOT set a location here; some event types only allow attendeeAddress/in-person.
  // We still send the phone in the booking question + attendee so your SMS workflow can fire.
  const payload: any = {
    start: toUTC(startISO),
    eventTypeId: Number(eventTypeId),
    attendee: {
      name,
      email,
      timeZone,
      phoneNumber: phone || undefined, // helpful but not what workflows read
      language: "en",
    },
    // This is what your SMS workflow looks at:
    bookingFieldsResponses: phone ? { [PHONE_FIELD_SLUG]: phone } : undefined,
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
