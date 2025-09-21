import { NextRequest, NextResponse } from "next/server";

const CAL_BASE = "https://api.cal.com/v2";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    eventTypeId, // number | string  (required unless using slug+username/teamSlug)
    start,       // ISO string (UTC) – required
    attendee,    // { name, email, timeZone?, phoneNumber? } – required fields: name, email
    lengthInMinutes, // optional; Cal can infer from event type, but we pass if you provide it
    // Optional: eventTypeSlug, username/teamSlug/orgSlug, metadata, guests, location, etc.
    ...rest
  } = body ?? {};

  if (!eventTypeId || !start || !attendee?.name || !attendee?.email) {
    return NextResponse.json(
      { error: "Missing required fields: eventTypeId, start, attendee{name,email}" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`${CAL_BASE}/bookings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CALCOM_API_KEY ?? ""}`,
        "cal-api-version":
          process.env.CALCOM_API_VERSION_BOOKINGS ?? "2024-08-13",
      },
      body: JSON.stringify({
        eventTypeId: Number(eventTypeId),
        start, // must be UTC ISO, eg "2025-09-23T15:00:00Z"
        attendee,
        ...(lengthInMinutes ? { lengthInMinutes } : {}),
        ...rest,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error ?? data, status: res.status },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to create booking", detail: String(err) },
      { status: 502 }
    );
  }
}
