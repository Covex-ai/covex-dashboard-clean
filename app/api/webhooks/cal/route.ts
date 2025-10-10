import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CALCOM_WEBHOOK_SECRET = process.env.CALCOM_WEBHOOK_SECRET || "";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function parseCalPayload(raw: any) {
  const type = raw?.type || raw?.triggerEvent || raw?.event || "";
  const data = raw?.data || raw?.payload || raw?.booking || raw;
  return { type: String(type).toUpperCase(), data };
}

function verifySignature(body: string, header: string | null) {
  if (!CALCOM_WEBHOOK_SECRET) return true; // allow in dev if no secret set
  if (!header) return false;
  const sig = header.replace(/^sha256=/i, "");
  const hmac = crypto.createHmac("sha256", CALCOM_WEBHOOK_SECRET);
  hmac.update(body, "utf8");
  const expected = hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function normalizeStatus(s: string | null | undefined) {
  const v = (s ?? "").toLowerCase();
  if (v.includes("cancel")) return "Cancelled";
  if (v.includes("resched")) return "Rescheduled";
  if (v.includes("reject")) return "Cancelled";
  return "Booked";
}

function pickAttendee(data: any) {
  const a = (data?.attendees?.[0]) || {};
  return {
    name: a?.name || a?.fullName || data?.name || null,
    phone: a?.phone || null,
  };
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const sigHeader =
    req.headers.get("x-cal-signature") ||
    req.headers.get("cal-signature-256") ||
    req.headers.get("cal-signature") ||
    null;

  if (!verifySignature(rawBody, sigHeader)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  const json = JSON.parse(rawBody || "{}");
  const { type, data } = parseCalPayload(json);

  const uid: string | null =
    data?.uid || data?.bookingUid || data?.booking?.uid || null;

  const replacedUid: string | null =
    data?.replacesBookingUid || data?.replacedBookingUid || data?.oldBookingUid || null;

  const eventTypeId: number | null =
    data?.eventTypeId || data?.eventType?.id || null;

  const startISO: string | null = data?.startTime || data?.start || null;
  const endISO: string | null   = data?.endTime   || data?.end   || null;

  const { name: caller_name, phone: caller_phone_e164 } = pickAttendee(data);

  let service_id: number | null = null;
  let business_id: string | null = null;
  if (eventTypeId != null) {
    const { data: svc } = await admin
      .from("services")
      .select("id,business_id,default_price_usd,event_type_id")
      .eq("event_type_id", eventTypeId)
      .maybeSingle();
    if (svc) {
      service_id = svc.id;
      business_id = svc.business_id;
    }
  }

  try {
    if (!uid) return NextResponse.json({ ok: true, note: "no uid" });

    if (type.includes("BOOKING_CREATED")) {
      const status = normalizeStatus(data?.status || "ACCEPTED");
      const patch: any = {
        source: "Cal.com",
        status,
        cal_booking_uid: uid,
        start_ts: startISO ?? null,
        end_ts: endISO ?? null,
        caller_name,
        caller_phone_e164,
      };
      if (service_id != null) patch.service_id = service_id;
      if (business_id) patch.business_id = business_id;

      const { data: existing } = await admin
        .from("appointments")
        .select("id,business_id")
        .or(`cal_booking_uid.eq.${uid},booking_id.eq.${uid}`)
        .maybeSingle();

      if (existing) {
        await admin.from("appointments").update(patch).eq("id", existing.id);
      } else {
        if (!business_id) {
          return NextResponse.json({ ok: true, note: "no business_id; nothing inserted" });
        }
        await admin.from("appointments").insert([{ ...patch, business_id }]);
      }
    } else if (type.includes("BOOKING_RESCHEDULED")) {
      const status = "Rescheduled";
      if (replacedUid) {
        const { data: ex } = await admin
          .from("appointments")
          .select("id")
          .or(`cal_booking_uid.eq.${replacedUid},booking_id.eq.${replacedUid}`)
          .maybeSingle();
        if (ex) {
          await admin
            .from("appointments")
            .update({ cal_booking_uid: uid, start_ts: startISO, end_ts: endISO, status })
            .eq("id", ex.id);
        } else {
          const patch: any = { cal_booking_uid: uid, start_ts: startISO, end_ts: endISO, status, source: "Cal.com" };
          if (service_id != null) patch.service_id = service_id;
          if (business_id) patch.business_id = business_id;
          const { data: ex2 } = await admin
            .from("appointments")
            .select("id")
            .or(`cal_booking_uid.eq.${uid},booking_id.eq.${uid}`)
            .maybeSingle();
          if (ex2) await admin.from("appointments").update(patch).eq("id", ex2.id);
          else if (business_id) await admin.from("appointments").insert([{ ...patch, business_id }]);
        }
      } else {
        await admin
          .from("appointments")
          .update({ start_ts: startISO, end_ts: endISO, status })
          .or(`cal_booking_uid.eq.${uid},booking_id.eq.${uid}`);
      }
    } else if (
      type.includes("BOOKING_CANCELLED") ||
      type.includes("BOOKING_REJECTED") ||
      type.includes("MEETING_CANCELLED") ||
      type.includes("BOOKING_DELETED")
    ) {
      await admin
        .from("appointments")
        .update({ status: "Cancelled" })
        .or(`cal_booking_uid.eq.${uid},booking_id.eq.${uid}`);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("cal webhook error", e);
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
