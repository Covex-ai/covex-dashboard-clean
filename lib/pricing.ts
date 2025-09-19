// lib/pricing.ts

// ---- Types ---------------------------------------------------------------

export type NormalizedService =
  | "ACUTE_30"
  | "STANDARD_30"
  | "NEW_PATIENT_60";

// ---- Human labels --------------------------------------------------------

export const SERVICE_LABEL: Record<NormalizedService, string> = {
  ACUTE_30: "Acute pain / emergency adjustment",
  STANDARD_30: "Standard adjustment + soft tissue",
  NEW_PATIENT_60: "New patient exam + X-rays + adjustment",
};

// ---- Default prices (USD) ------------------------------------------------
// You can tweak these numbers any time.
export const SERVICE_PRICE_USD: Record<NormalizedService, number> = {
  ACUTE_30: 75,
  STANDARD_30: 95,
  NEW_PATIENT_60: 145,
};

// ---- Helpers -------------------------------------------------------------

/**
 * Safely coerce unknown -> number (or null).
 * Accepts numbers or numeric strings like "75" or "75.00".
 */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Format a number as USD currency. Returns "-" for null/undefined.
 */
export function fmtUSD(v: number | null | undefined): string {
  const n = typeof v === "number" ? v : null;
  if (n === null) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Get a price for a normalized service.
 * If a per-row price exists (fallback) we honor it; otherwise use the defaults.
 */
export function priceFor(
  normalized: NormalizedService | null | undefined,
  fallback?: number | string | null
): number {
  const maybe = toNumber(fallback);
  if (maybe !== null) return maybe;

  if (!normalized) return 0;
  return SERVICE_PRICE_USD[normalized] ?? 0;
}

/**
 * Resolve a user-facing label for the service.
 * If we have a normalized code, return our curated label; otherwise use the raw text.
 */
export function serviceLabelFor(
  normalized: NormalizedService | null | undefined,
  raw?: string | null
): string {
  if (normalized && SERVICE_LABEL[normalized]) return SERVICE_LABEL[normalized];
  return raw?.trim() || "—";
}
