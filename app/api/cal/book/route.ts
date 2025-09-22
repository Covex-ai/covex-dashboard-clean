import { NextResponse } from "next/server";

const CAL_BASE = process.env.CAL_BASE_URL ?? "https://api.cal.com";
const CAL_API_KEY = process.env.CAL_API_KEY!;

type BookBody = {
  eventTypeId: number;
  startISO: string;     // e.g. "2025-09-22T15:15:00.000Z"
  name: string;
  email: string;
  timeZone?: string;    // e.g. "America/New_York"
  phone?: string;       // optional, saved as metadata
};

/**
 * Minimal Cal.com booking proxy.
 * IMPORTANT: we DO NOT send `lengthInMinutes` – Cal will use the Event Type's fixed duration.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BookBody;

    if (!CAL_API_KEY) {
      return NextResponse.json(
        { error: "Missing CAL_API_KEY on server." },
        { status: 500 }
      );
    }

    const { eventTypeId, startISO, name, email, timeZone, phone } = body;

    if (!eventTypeId || !startISO || !name || !email) {
      return NextResponse.json(
        { error: "Missing required fields: eventTypeId, startISO, name, email." },
        { status: 400 }
      );
    }

    const payload: Record<string, any> = {
      eventTypeId,
      start: startISO,
      name,
      email,
      // only send timezone if provided; Cal falls back if omitted
      ...(timeZone ? { timeZone } : {}),
      // stash phone in metadata so it shows on the Cal booking
      ...(phone ? { metadata: { phone } } : {}),
    };

    const resp = await fetch(`${CAL_BASE}/v2/bookings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();
    return NextResponse.json(data, { status: resp.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Booking failed", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
