// Argentine tax ids for checkout billing (ADR-0036).
// DNI: 7–8 digits. CUIT/CUIL: 11 digits whose last one is the check digit
// of ARCA's modulo-11 rule (weights 5,4,3,2,7,6,5,4,3,2; 11 → 0, 10 → 9).

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function isValidCuit(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  const sum = WEIGHTS.reduce((acc, weight, index) => acc + weight * Number(digits[index]), 0);
  const rest = 11 - (sum % 11);
  const check = rest === 11 ? 0 : rest === 10 ? 9 : rest;
  return check === Number(digits[10]);
}

export const isDni = (digits: string) => /^\d{7,8}$/.test(digits);

/** IVA conditions offered at checkout (ARCA codes). Others are handled by
 * the shop over WhatsApp. */
export const CHECKOUT_IVA_CONDITIONS = [5, 1, 6, 4] as const;
export const CONSUMIDOR_FINAL = 5;
