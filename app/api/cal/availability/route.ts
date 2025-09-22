export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const CAL_BASE = "https://api.cal.com/v2";

/**
 * /api/cal/availability?eventTypeId=3278907&date=2025-09-22&timeZone=America/New_York&duration=45
 *
 * - Uses GET /v2/slots with eventTypeId, start, end (same day), timeZone
 * - Requires header: cal-api-version: 2024-09-04
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const eventTypeId = url.searchParams.get("eventTypeId");
    const date = url.searchParams.get("date"); // YYYY-MM-DD (preferred)
    const timeZone = url.searchParams.get("timeZone") ?? "America/New_York";
    const duration = url.searchParams.get("duration") ?? undefined;

    if (!eventTypeId) {
      return NextResponse.json({ error: "Missing eventTypeId" }, { status: 400 });
    }
    if (!process.env.CALCOM_API_KEY) {
      return NextResponse.json({ error: "CALCOM_API_KEY missing" }, { status: 500 });
    }

    // If no date passed, use today in user's TZ but send date-only per API.
    const today = new Date();
    const yyyy = today.getUTCFullYear();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const day = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : `${yyyy}-${mm}-${dd}`;

    // Per docs, date-only values are allowed: start defaults to 00:00:00, end to 23:59:59. :contentReference[oaicite:1]{index=1}
    const params = new URLSearchParams({
      eventTypeId,
      start: day,
      end: day,
      timeZone,
    });
    if (duration) params.set("duration", duration);
    // If you ever need exact start/end datetimes, add format=range to receive both start & end.
    // params.set("format", "time");

    const r = await fetch(`${CAL_BASE}/slots?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.CALCOM_API_KEY}`,
        "cal-api-version": "2024-09-04", // required for /v2/slots
      },
      cache: "no-store",
    });

    const rawText = await r.text();
    const json = rawText ? JSON.parse(rawText) : {};

    if (!r.ok) {
      return NextResponse.json(
        {
          status: r.status,
          body: json,
          hint:
            "Check eventTypeId belongs to the same Cal.com workspace as your API key, and that cal-api-version is 2024-09-04.",
        },
        { status: 502 }
      );
    }

    // v2/slots returns { status: "success", data: { "YYYY-MM-DD": [ {start: "..."} ] } } :contentReference[oaicite:2]{index=2}
    const map = json?.data ?? {};
    const all = Object.keys(map)
      .sort()
      .flatMap((d) =>
        (map[d] ?? []).map((slot: any) => (typeof slot === "string" ? slot : slot?.start)).filter(Boolean)
      );

    return NextResponse.json({ slots: all, via: "GET /v2/slots", day, timeZone });
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
