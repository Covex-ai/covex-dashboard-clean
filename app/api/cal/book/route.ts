export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      eventTypeId,      // number | string
      start,            // ISO string (MUST be UTC, e.g. "2025-09-22T14:00:00Z")
      timeZone,         // e.g. "America/New_York"
      name,             // attendee name
      email,            // attendee email (Cal.com requires an attendee object)
      phoneNumber,      // E.164 if you have it
      lengthInMinutes,  // optional override; otherwise Cal uses the event type length
      metadata,         // optional object
    } = body || {};

    if (!process.env.CALCOM_API_KEY) {
      return NextResponse.json({ error: "CALCOM_API_KEY missing" }, { status: 500 });
    }
    if (!eventTypeId || !start || !name || !email) {
      return NextResponse.json(
        { error: "Missing required fields: eventTypeId, start, name, email" },
        { status: 400 }
      );
    }

    const payload: any = {
      start,                           // must be UTC
      eventTypeId: Number(eventTypeId),
      attendee: {
        name,
        email,
        timeZone: timeZone ?? "America/New_York",
        phoneNumber: phoneNumber ?? undefined,
        language: "en",
      },
    };
    if (lengthInMinutes) payload.lengthInMinutes = Number(lengthInMinutes);
    if (metadata) payload.metadata = metadata;

    const r = await fetch("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
        "Content-Type": "application/json",
        "cal-api-version": "2024-08-13", // required for /v2/bookings
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await r.text();
    const json = text ? JSON.parse(text) : {};

    if (!r.ok) {
      return NextResponse.json(
        {
          status: r.status,
          body: json,
          hint:
            "Confirm the start is UTC (Z suffix), eventTypeId is correct for this API key’s workspace, and cal-api-version=2024-08-13.",
        },
        { status: 502 }
      );
    }

    // Return the booking object { data: {...} }
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
