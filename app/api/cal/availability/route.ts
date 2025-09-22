import { NextRequest, NextResponse } from "next/server";

function normalizeDay(input: string): string {
  // accepts "YYYY-MM-DD" or anything Date can parse
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date");
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const key = process.env.CAL_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing CAL_API_KEY on server." }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const eventTypeId = searchParams.get("eventTypeId");
  const rawDate = searchParams.get("date");
  const timeZone = searchParams.get("timeZone") || "America/New_York";

  if (!eventTypeId || !rawDate) {
    return NextResponse.json({ error: "eventTypeId and date are required" }, { status: 400 });
  }

  let date = rawDate;
  try { date = normalizeDay(rawDate); } catch {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  // Cal v2: GET /v2/slots + cal-api-version
  const url = new URL("https://api.cal.com/v2/slots");
  url.searchParams.set("eventTypeId", String(eventTypeId));
  url.searchParams.set("start", date); // date-only is allowed; server treats as start-of-day UTC
  url.searchParams.set("end", date);   // same-day range
  url.searchParams.set("timeZone", timeZone);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${key}`,
      "cal-api-version": "2024-09-04", // REQUIRED for /v2/slots
    },
    cache: "no-store",
  });

  let body: any = null;
  try { body = await res.json(); } catch {}

  if (!res.ok || body?.status !== "success") {
    const msg = body?.error?.message || body?.error || body || "Cal.com /v2/slots failed";
    return NextResponse.json({ error: msg }, { status: res.status || 502 });
  }

  // body.data is an object keyed by date → each value is an array of {start: ISO}
  const slots: string[] = [];
  const data = body.data;
  if (data && typeof data === "object") {
    for (const arr of Object.values<any>(data)) {
      if (Array.isArray(arr)) {
        for (const s of arr) {
          const iso = typeof s === "string" ? s : s?.start || s?.startTime || s?.utcStart || s?.time || null;
          if (iso && !Number.isNaN(Date.parse(iso))) slots.push(iso);
        }
      }
    }
  }

  slots.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return NextResponse.json({ slots });
}
