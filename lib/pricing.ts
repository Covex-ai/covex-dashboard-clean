// lib/pricing.ts

// You can treat this as the single source of truth for pricing + labels.
// Edit the map/labels any time without touching pages.

export type NormalizedService = string;

// Default prices used when a row.price_usd is null
export const SERVICE_PRICE_USD: Record<string, number> = {
  ACUTE_30: 75,
  STANDARD_30: 60,
  NEW_PATIENT_60: 120,
  // add more codes if you introduce them
};

// Pretty labels shown in the UI
const SERVICE_LABELS: Record<string, string> = {
  ACUTE_30: 'Acute pain / emergency adjustment',
  STANDARD_30: 'Standard adjustment + soft tissue',
  NEW_PATIENT_60: 'New patient exam + X-rays + adjustment',
};

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
  return s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

// Turn DB price into a number (or null)
export function toNumber(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Use explicit price if provided, otherwise default price map, otherwise 0
export function priceFor(
  normalized: NormalizedService | null | undefined,
  explicitPrice: number | null | undefined
): number {
  if (typeof explicitPrice === 'number') return explicitPrice;
  if (normalized && SERVICE_PRICE_USD[normalized] != null) return SERVICE_PRICE_USD[normalized];
  return 0;
}

export function fmtUSD(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n || 0);
}
