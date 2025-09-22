import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const key = process.env.CAL_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing CAL_API_KEY" }, { status: 500 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const r = await fetch(`https://api.cal.com/v2/event-types/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json({ status: r.status, body: j });
}
