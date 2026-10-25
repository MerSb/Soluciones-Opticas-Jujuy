// Argentine tax ids at checkout (ADR-0036) — the same rules the API
// applies (apps/api/src/lib/tax-id.ts), here only for immediate feedback.
// CUIT/CUIL: 11 digits with ARCA's modulo-11 check digit.

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export const digitsOf = (value: string) => value.replace(/\D/g, "");

export function isValidCuit(value: string): boolean {
  const digits = digitsOf(value);
  if (!/^\d{11}$/.test(digits)) return false;
  const sum = WEIGHTS.reduce((acc, weight, index) => acc + weight * Number(digits[index]), 0);
  const rest = 11 - (sum % 11);
  const check = rest === 11 ? 0 : rest === 10 ? 9 : rest;
  return check === Number(digits[10]);
}

export const isDni = (value: string) => /^\d{7,8}$/.test(digitsOf(value));

export const CONSUMIDOR_FINAL = 5;

/** IVA conditions offered at checkout (ARCA codes). */
export const CHECKOUT_IVA_CONDITIONS = [
  { code: 5, label: "Consumidor final" },
  { code: 1, label: "Responsable inscripto" },
  { code: 6, label: "Monotributista" },
  { code: 4, label: "Exento" },
] as const;
