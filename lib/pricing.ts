// lib/pricing.ts

// If your DB has a normalized_service like "ACUTE_30", it will match here.
// Otherwise we fall back to price_usd from the row or 0.
export type NormalizedService = string;

// Default price map (edit to your real prices any time)
export const SERVICE_PRICE_USD: Record<string, number> = {
  ACUTE_30: 75,          // Acute pain / emergency adjustment
  STANDARD_30: 60,       // Standard adjustment + soft tissue
  NEW_PATIENT_60: 120,   // New patient exam + X-rays + adjustment
  // add more if you introduce new normalized_service codes
};

// Human-friendly labels for the dashboard
const SERVICE_LABELS: Record<string, string> = {
  ACUTE_30: 'Acute pain / emergency adjustment',
  STANDARD_30: 'Standard adjustment + soft tissue',
  NEW_PATIENT_60: 'New patient exam + X-rays + adjustment',
};

// Turn a service into a nice label for UI.
// 1) prefer our label for the normalized code
// 2) else try to clean service_raw
// 3) else show the code or “Other”
export function serviceLabelFor(
  normalized: NormalizedService | null | undefined,
  serviceRaw?: string | null
): string {
  if (normalized && SERVICE_LABELS[normalized]) return SERVICE_LABELS[normalized];
  if (serviceRaw && serviceRaw.trim()) return tidy(serviceRaw);
  if (normalized && normalized.trim()) return tidy(normalized);
  return 'Other';
}

function tidy(s: string) {
  // De-snake_case and trim
  return s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

// Use explicit price if provided, otherwise default map, otherwise 0
export function priceFor(
  normalized: NormalizedService | null | undefined,
  explicitPrice: number | null | undefined
): number {
  if (typeof explicitPrice === 'number' && !Number.isNaN(explicitPrice)) return explicitPrice;
  if (normalized && SERVICE_PRICE_USD[normalized] != null) return SERVICE_PRICE_USD[normalized];
  return 0;
}

export function toNumber(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fmtUSD(n: number): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    n || 0
  );
}
