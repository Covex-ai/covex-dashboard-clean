import { NextResponse } from "next/server";

function base() {
  const b = process.env.CAL_API_BASE || "https://api.cal.com";
  return b.replace(/\/+$/, "");
}
function calHeaders() {
  return {
    "content-type": "application/json",
    Authorization: `Bearer ${process.env.CAL_API_KEY || ""}`,
  };
}

/**
 * Body:
 * {
 *   eventTypeId: number,
 *   start: ISO,
 *   end: ISO,
 *   invitee: { name: string, email?: string, phone?: string },
 *   timeZone?: string,
 *   notes?: string
 * }
 */
export async function POST(req: Request) {
  try {
    const { eventTypeId, start, end, invitee, timeZone, notes } = await req.json();
    if (!eventTypeId || !start || !end || !invitee?.name) {
      return NextResponse.json(
        { ok: false, error: "Missing eventTypeId/start/end/invitee.name" },
        { status: 400 }
      );
    }
    const tz = timeZone || process.env.CAL_TIMEZONE || "America/New_York";

    const payload = {
      eventTypeId,
      start,
      end,
      timeZone: tz,
      title: invitee.name,
      invitee: {
        name: invitee.name,
        email: invitee.email || "no-email@placeholder.local",
        phoneNumber: invitee.phone || undefined,
      },
      metadata: { notes: notes || "" },
    };

    // v2 then v1
    let url = `${base()}/v2/bookings`;
    let r = await fetch(url, { method: "POST", headers: calHeaders(), body: JSON.stringify(payload) });
    let data: any = null;

    if (r.ok) {
      data = await r.json().catch(() => ({}));
    } else {
      url = `${base()}/v1/bookings`;
      r = await fetch(url, { method: "POST", headers: calHeaders(), body: JSON.stringify(payload) });
      data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, error: data?.error || "Cal.com booking failed" },
          { status: 502 }
        );
      }
    }

    const booking_id = data?.id || data?.bookingId || data?.booking_id || null;
    const booking_url = data?.url || data?.bookingUrl || data?.booking_url || null;

    return NextResponse.json({ ok: true, data: { booking_id, booking_url, raw: data } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
