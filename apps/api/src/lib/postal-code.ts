// Argentine postal codes (ADR-0024): either the 4-digit form ("4600") or
// the alphanumeric CPA — province letter + 4 digits + 3 letters
// ("B1842ZAB"). Format check only: no external lookup, and the province
// is never inferred from it (provinceCode is validated separately).
export const ARGENTINE_POSTAL_CODE_PATTERN = /^(?:\d{4}|[A-HJ-NP-Z]\d{4}[A-Z]{3})$/;

export function normalizePostalCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidArgentinePostalCode(raw: string): boolean {
  return ARGENTINE_POSTAL_CODE_PATTERN.test(normalizePostalCode(raw));
}
