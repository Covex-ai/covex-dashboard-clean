export const SERVICE_LABELS: Record<string, string> = {
  ACUTE_30: "Acute pain / emergency adjustment",
  STANDARD: "Standard adjustment + soft tissue (established)",
  NEW_PT: "New patient exam + X-rays + adjustment",
};

export const SERVICE_PRICE_USD: Record<string, number> = {
  ACUTE_30: 75,
  STANDARD: 90,
  NEW_PT: 120,
};

export function normalizeService(input?: string | null): keyof typeof SERVICE_PRICE_USD | undefined {
  if (!input) return undefined;
  const s = input.toLowerCase();

  if (s.includes("acute")) return "ACUTE_30";
  if (s.includes("standard")) return "STANDARD";
  if (s.includes("new patient") || s.includes("x-ray") || s.includes("x-rays")) return "NEW_PT";

  // fallbacks for codes like ACUTE_30, STANDARD, NEW_PT
  if (s.includes("acute_30")) return "ACUTE_30";
  if (s.includes("standard")) return "STANDARD";
  if (s.includes("new_pt")) return "NEW_PT";
  return undefined;
}

export function serviceLabelFor(normalized?: string, raw?: string | null) {
  if (normalized && SERVICE_LABELS[normalized]) return SERVICE_LABELS[normalized];
  return raw ?? "—";
}

export function toNumber(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  const n = typeof x === "string" ? parseFloat(x) : (x as number);
  return Number.isFinite(n) ? n : null;
}

export function priceFor(
  normalized?: keyof typeof SERVICE_PRICE_USD,
  override?: number | string | null
): number {
  const over = toNumber(override);
  if (over !== null) return over;
  if (normalized && SERVICE_PRICE_USD[normalized] !== undefined) return SERVICE_PRICE_USD[normalized];
  return 0;
}
