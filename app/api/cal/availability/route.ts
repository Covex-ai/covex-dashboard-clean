import { NextRequest, NextResponse } from "next/server";

const CAL_BASE = "https://api.cal.com/v2";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const eventTypeId = url.searchParams.get("eventTypeId"); // required
  const timeZone = url.searchParams.get("timeZone") ?? "America/New_York";

  // Optional window (defaults = now → +30 days)
  const startQ = url.searchParams.get("start");
  const endQ = url.searchParams.get("end");

  if (!eventTypeId) {
    return NextResponse.json(
      { error: "Missing query param: eventTypeId" },
      { status: 400 }
    );
  }

  const now = new Date();
  const startISO = startQ ?? now.toISOString();
  const endISO =
    endQ ??
    new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // +30d

  try {
    const res = await fetch(
      `${CAL_BASE}/slots?eventTypeId=${encodeURIComponent(
        eventTypeId
      )}&start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(
        endISO
      )}&timeZone=${encodeURIComponent(timeZone)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CALCOM_API_KEY ?? ""}`,
          "cal-api-version":
            process.env.CALCOM_API_VERSION_SLOTS ?? "2024-09-04",
        },
        cache: "no-store",
      }
    );

    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Cal.com returned non-JSON", raw: text },
        { status: 502 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: json?.error ?? json, status: res.status },
        { status: 502 }
      );
    }

    // Cal.com v2 typically replies with { status:'success', data: { slots: [...] } }
    // Each slot is either an ISO string or { start: ISO, end: ISO }. Normalize to ISO starts.
    const slotsArray: string[] =
      Array.isArray(json?.data?.slots)
        ? json.data.slots.map((s: any) => (typeof s === "string" ? s : s?.start)).filter(Boolean)
        : Array.isArray(json?.slots)
        ? json.slots.map((s: any) => (typeof s === "string" ? s : s?.start)).filter(Boolean)
        : [];

    return NextResponse.json({ slots: slotsArray });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to reach Cal.com", detail: String(err) },
      { status: 502 }
    );
  }
}
