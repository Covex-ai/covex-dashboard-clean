// lib/pricing.ts

// ===============================
// Types
// ===============================

export type NormalizedService =
  | "ACUTE_30"
  | "STANDARD_30"
  | "NEW_PATIENT_60";

// ===============================
// Display labels (exact text used in UI)
// ===============================

export const SERVICE_LABEL: Record<NormalizedService, string> = {
  ACUTE_30: "Acute pain / emergency adjustment",
  STANDARD_30: "Standard adjustment + soft tissue",
  NEW_PATIENT_60: "New patient exam + X-rays + adjustment",
};

// ===============================
// Default prices (USD)
// ===============================

export const SERVICE_PRICE_USD: Record<NormalizedService, number> = {
  ACUTE_30: 75,
  STANDARD_30: 95,
  NEW_PATIENT_60: 145,
};

// ===============================
// Helpers
// ===============================

/** Safely coerce unknown -> number (or null). */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Format a number as USD. Returns "-" for null/undefined. */
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
 * Normalize a raw service name (or code) into our internal enum.
 * Handles variations like underscores, hyphens, different wording, etc.
 */
export function normalizeService(
  input: string | null | undefined
): NormalizedService | null {
  if (!input) return null;

  const s = input
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // ACUTE_30
  if (
    s.includes("acute") ||
    s.includes("emergency") ||
    s.includes("urgent") ||
    s.includes("acute 30") ||
    s === "acute" ||
    s === "acute pain" ||
    s === "acute pain / emergency adjustment" ||
    s === "acute pain emergency adjustment"
  ) {
    return "ACUTE_30";
  }

  // STANDARD_30
  if (
    s.includes("standard") ||
    s.includes("established") ||
    s.includes("soft tissue") ||
    s.includes("regular adjustment") ||
    s.includes("adjustment + soft tissue") ||
    s.includes("standard 30")
  ) {
    return "STANDARD_30";
  }

  // NEW_PATIENT_60
  if (
    s.includes("new patient") ||
    s.includes("exam") ||
    s.includes("x-ray") ||
    s.includes("x rays") ||
    s.includes("x-rays") ||
    s.includes("intake") ||
    s.includes("consult") ||
    s.includes("np") ||
    s.includes("60")
  ) {
    return "NEW_PATIENT_60";
  }

  // Fallback: if the string is exactly one of our codes
  if (s === "acute 30") return "ACUTE_30";
  if (s === "standard 30") return "STANDARD_30";
  if (s === "new patient 60") return "NEW_PATIENT_60";

  return null;
}

/**
 * Return a display label. If we have a normalized code, use our curated label;
 * otherwise show the raw text.
 */
export function serviceLabelFor(
  normalized: NormalizedService | null | undefined,
  raw?: string | null
): string {
  if (normalized && SERVICE_LABEL[normalized]) return SERVICE_LABEL[normalized];
  return raw?.trim() || "—";
}

/**
 * Compute the price for a service.
 * - If a per-row price exists (fallback), use it.
 * - Otherwise, use our default price for the normalized service.
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
