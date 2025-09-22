import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.CAL_API_KEY;
  if (!key) return NextResponse.json({ error: "Missing CAL_API_KEY" }, { status: 500 });
  const r = await fetch("https://api.cal.com/v2/me", {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  return NextResponse.json({ status: r.status, body: j });
}
