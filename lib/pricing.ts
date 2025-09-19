export type NormalizedService =
  | "ACUTE_30"
  | "STANDARD_30"
  | "NEW_PATIENT_60";

export const SERVICE_PRICE_USD: Record<NormalizedService, number> = {
  ACUTE_30: 75,
  STANDARD_30: 85,
  NEW_PATIENT_60: 150,
};

export function normalizeService(raw: string | null | undefined): NormalizedService | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("acute")) return "ACUTE_30";
  if (s.includes("standard")) return "STANDARD_30";
  if (s.includes("new") && (s.includes("exam") || s.includes("x-ray") || s.includes("xray"))) return "NEW_PATIENT_60";
  return null;
}

export function serviceLabelFor(ns: NormalizedService | null, raw?: string | null): string {
  if (!ns) return raw ?? "Service";
  switch (ns) {
    case "ACUTE_30":
      return "Acute pain / emergency adjustment";
    case "STANDARD_30":
      return "Standard adjustment + soft tissue (established)";
    case "NEW_PATIENT_60":
      return "New patient exam + X-rays + adjustment";
  }
}

export function toNumber(x: unknown, fallback = 0): number {
  if (x == null) return fallback;
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

export function priceFor(ns: NormalizedService | null, fallbackPrice?: number | null): number {
  if (ns && ns in SERVICE_PRICE_USD) return SERVICE_PRICE_USD[ns];
  return toNumber(fallbackPrice ?? 0, 0);
}

export function fmtUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
