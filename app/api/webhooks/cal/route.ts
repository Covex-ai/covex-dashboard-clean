// app/api/webhooks/cal/route.ts
import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CALCOM_WEBHOOK_SECRET = process.env.CALCOM_WEBHOOK_SECRET || ""; // optional verify

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** Try to support different Cal.com payload shapes */
function parseCalPayload(raw: any) {
  // common shapes: { type, data } or { triggerEvent, payload }
  const type = raw?.type || raw?.triggerEvent || raw?.event || "";
  const data = raw?.data || raw?.payload || raw?.booking || raw;
  return { type: String(type).toUpperCase(), data };
}

/** Best-effort HMAC verification; if no secret set, we allow (dev mode). */
function verifySignature(body: string, header: string | null) {
  if (!CALCOM_WEBHOOK_SECRET) return true;
  if (!header) return false;

  // Some installs use x-cal-signature, others a sha256 string. We try both.
  const sig = header.replace(/^sha256=/i, "");
  const hmac = crypto.createHmac("sha256", CALCOM_WEBHOOK_SECRET);
  hmac.update(body, "utf8");
  const expected = hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** Normalize status to your dashboard values */
function normalizeStatus(s: string | null | undefined) {
  const v = (s ?? "").toLowerCase();
  if (v.includes("cancel")) return "Cancelled";
  if (v.includes("resched")) return "Rescheduled";
  if (v.includes("reject")) return "Cancelled";
  return "Booked";
}

/** Try to pick a display name/phone from payload */
function pickAttendee(data: any) {
  const a = (data?.attendees?.[0]) || {};
  return {
    name: a?.name || a?.fullName || data?.name || null,
    phone: a?.phone || null,
  };
}

export async function POST(req: Request) {
  // 1) read raw body for signature, then parse JSON
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

  // 2) extract fields we care about
  const uid: string | null =
    data?.uid || data?.bookingUid || data?.booking?.uid || null;

  const replacedUid: string | null =
    data?.replacesBookingUid || data?.replacedBookingUid || data?.oldBookingUid || null;

  const eventTypeId: number | null =
    data?.eventTypeId || data?.eventType?.id || null;

  const startISO: string | null = data?.startTime || data?.start || null;
  const endISO: string | null   = data?.endTime   || data?.end   || null;

  const { name: caller_name, phone: caller_phone_e164 } = pickAttendee(data);

  // 3) figure out business/service from eventTypeId (if we need to insert)
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

  // 4) act on event type
  try {
    if (!uid) {
      // No UID — nothing we can do reliably
      return NextResponse.json({ ok: true, note: "no uid" });
    }

    if (type.includes("BOOKING_CREATED")) {
      // Upsert (by business_id + cal_booking_uid if we have business; else by UID only)
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

      // Try update existing row first
      const { data: existing } = await admin
        .from("appointments")
        .select("id,business_id")
        .or(`cal_booking_uid.eq.${uid},booking_id.eq.${uid}`)
        .maybeSingle();

      if (existing) {
        await admin.from("appointments").update(patch).eq("id", existing.id);
      } else {
        // need business_id to insert; if we couldn't derive it, bail gracefully
        if (!business_id) {
          return NextResponse.json({ ok: true, note: "no business_id; nothing inserted" });
        }
        await admin.from("appointments").insert([{ ...patch, business_id }]);
      }
    }

    else if (type.includes("BOOKING_RESCHEDULED")) {
      // Two patterns:
      // A) same uid with new times
      // B) new uid replaces old uid (replacedUid)
      const status = "Rescheduled";
      if (replacedUid) {
        // Update the EXISTING row (old uid) in-place to the new times and uid
        // Keeps your analytics under the same row
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
          // if we can't find the old one, fall back to upsert by new uid
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
        // same UID — just update times + status
        await admin
          .from("appointments")
          .update({ start_ts: startISO, end_ts: endISO, status })
          .or(`cal_booking_uid.eq.${uid},booking_id.eq.${uid}`);
      }
    }

    else if (type.includes("BOOKING_CANCELLED") || type.includes("BOOKING_REJECTED") || type.includes("MEETING_CANCELLED")) {
      await admin
        .from("appointments")
        .update({ status: "Cancelled" })
        .or(`cal_booking_uid.eq.${uid},booking_id.eq.${uid}`);
    }

    // Some setups send BOOKING_DELETED; treat as cancelled for analytics
    else if (type.includes("BOOKING_DELETED")) {
      await admin
        .from("appointments")
        .update({ status: "Cancelled" })
        .or(`cal_booking_uid.eq.${uid},booking_id.eq.${uid}`);
    }

    // Best-effort logging
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("cal webhook error", e);
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
