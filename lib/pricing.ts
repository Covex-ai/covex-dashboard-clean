export type NormalizedService = 'ACUTE_30' | 'STANDARD_45' | 'NEWPATIENT_60';

export const SERVICE_PRICE_USD: Record<NormalizedService, number> = {
  ACUTE_30: 80,          // <- set your real prices here
  STANDARD_45: 120,
  NEWPATIENT_60: 180,
};

/** If `price_usd` is in the DB use it; otherwise fall back to the map above. */
export function priceFor(
  normalized: string | null | undefined,
  explicit?: number | null
): number | null {
  if (typeof explicit === 'number') return explicit;
  if (!normalized) return null;
  return SERVICE_PRICE_USD[normalized as NormalizedService] ?? null;
}

export const fmtUSD = (n?: number | null) =>
  n == null ? '-' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
