// lib/pricing.ts
export type NormalizedService = 'ACUTE_30' | 'STANDARD_45' | 'NEWPATIENT_60' | null;

/** Default prices you can tweak */
const PRICE_TABLE: Record<Exclude<NormalizedService, null>, number> = {
  ACUTE_30: 0,        // set your real price
  STANDARD_45: 0,     // set your real price
  NEWPATIENT_60: 0,   // set your real price
};

/** Professional labels for the dashboard */
const DISPLAY_NAMES: Record<Exclude<NormalizedService, null>, string> = {
  ACUTE_30: 'Acute pain / emergency adjustment (30 min)',
  STANDARD_45: 'Standard adjustment + soft tissue (45 min)',
  NEWPATIENT_60: 'New patient exam + X-rays + adjustment (60 min)',
};

/** Format USD */
export function fmtUSD(value: number | null | undefined) {
  const n = typeof value === 'number' ? value : 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

/** Coerce potential text/nullable numeric fields into a number (or 0) */
export function toNumber(n: string | number | null | undefined): number {
  if (typeof n === 'number') return n;
  if (typeof n === 'string') {
    const p = parseFloat(n);
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

/**
 * Return a price for a service. If the row carries price_usd, prefer it.
 * Fallback to our default table (so UI stays consistent even if null).
 */
export function priceFor(normalized: NormalizedService, priceFromRow?: string | number | null): number {
  const explicit = toNumber(priceFromRow);
  if (explicit > 0) return explicit;

  if (!normalized) return 0;
  return PRICE_TABLE[normalized] ?? 0;
}

/**
 * Friendly label for the UI:
 *  - use normalized mapping when present
 *  - otherwise fall back to service_raw
 */
export function serviceLabelFor(normalized: NormalizedService, serviceRaw?: string | null): string {
  if (normalized && DISPLAY_NAMES[normalized]) return DISPLAY_NAMES[normalized];
  return serviceRaw ?? '—';
}
