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
 * { eventTypeId: number, start: ISO, end: ISO, timeZone?: string }
 *
 * We try v2 first, then v1 fallback. Return { ok, data: { available, slots } }.
 */
export async function POST(req: Request) {
  try {
    const { eventTypeId, start, end, timeZone } = await req.json();
    if (!eventTypeId || !start || !end) {
      return NextResponse.json(
        { ok: false, error: "Missing eventTypeId/start/end" },
        { status: 400 }
      );
    }
    const tz = timeZone || process.env.CAL_TIMEZONE || "America/New_York";

    // v2
    let url = `${base()}/v2/availability/slots?eventTypeId=${encodeURIComponent(
      eventTypeId
    )}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(
      end
    )}&timeZone=${encodeURIComponent(tz)}`;
    let r = await fetch(url, { headers: calHeaders() });
    let data: any = null;

    if (r.ok) {
      data = await r.json().catch(() => ({}));
    } else {
      // v1 fallback
      url = `${base()}/v1/availability/slots?eventTypeId=${encodeURIComponent(
        eventTypeId
      )}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(
        end
      )}&timeZone=${encodeURIComponent(tz)}`;
      r = await fetch(url, { headers: calHeaders() });
      data = await r.json().catch(() => ({}));
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, error: data?.error || "Cal.com availability failed" },
          { status: 502 }
        );
      }
    }

    const slots: string[] =
      data?.slots?.map((s: any) => (typeof s === "string" ? s : s?.start)) ?? [];
    const wanted = new Date(start).toISOString();
    const available = slots.some((s) => new Date(s).toISOString() === wanted);

    return NextResponse.json({ ok: true, data: { available, slots } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
