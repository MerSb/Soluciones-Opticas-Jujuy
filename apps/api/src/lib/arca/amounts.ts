import { Prisma } from "@prisma/client";
import { type VoucherClass, vatRate } from "./codes.js";

// Amounts of a voucher, following the formulas of the WSFEv1 manual v4.8
// (FECAEDetRequest): ImpTotal = ImpTotConc + ImpOpEx + ImpNeto + ImpIVA +
// ImpTrib; for class C, ImpTotConc, ImpOpEx and ImpIVA are 0 and no Iva
// array is sent (ImpNeto is the subtotal); for A and B, ImpIVA is the sum
// of the Iva array (one AlicIva per rate: base and amount).
//
// Online prices are what the buyer paid, VAT included. They are never
// changed: the total of the voucher is exactly the sum paid, and for A/B
// each rate's paid amount is split into base = paid / (1 + rate) and
// VAT = paid − base. Untaxed/exempt lines and other taxes (Tributos) are
// not used until the accountant says they apply.

const ZERO = new Prisma.Decimal(0);
const round2 = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface AmountLineInput {
  quantity: Prisma.Decimal.Value;
  /** Price per unit as paid, VAT included. */
  unitPrice: Prisma.Decimal.Value;
  vatRateCode: number | null;
}

export interface LineAmounts {
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
}

export interface VatLine {
  code: number;
  base: Prisma.Decimal;
  amount: Prisma.Decimal;
}

export interface VoucherAmounts {
  lines: LineAmounts[];
  untaxedAmount: Prisma.Decimal;
  exemptAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  otherTaxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  vatLines: VatLine[];
}

export class AmountError extends Error {}

const splitGross = (gross: Prisma.Decimal, rate: string) => {
  const base = round2(gross.div(new Prisma.Decimal(1).add(rate)));
  return { base, vat: gross.sub(base) };
};

export function computeVoucherAmounts(
  voucherClass: VoucherClass,
  lines: AmountLineInput[],
): VoucherAmounts {
  if (lines.length === 0) throw new AmountError("El comprobante necesita al menos un ítem.");
  const grossByRate = new Map<number, Prisma.Decimal>();
  const computed = lines.map((line, index) => {
    const gross = round2(new Prisma.Decimal(line.quantity).mul(line.unitPrice));
    if (voucherClass === "C") {
      if (line.vatRateCode !== null) {
        throw new AmountError(`Ítem ${index + 1}: un comprobante C no lleva IVA discriminado.`);
      }
      return { grossAmount: gross, netAmount: gross, vatAmount: ZERO };
    }
    if (line.vatRateCode === null) {
      throw new AmountError(`Ítem ${index + 1}: falta la alícuota de IVA (la define el contador).`);
    }
    const rate = vatRate(line.vatRateCode);
    if (!rate) throw new AmountError(`Ítem ${index + 1}: código de IVA desconocido.`);
    grossByRate.set(line.vatRateCode, (grossByRate.get(line.vatRateCode) ?? ZERO).add(gross));
    // Per-line split, for the PDF; ARCA checks the per-rate split below.
    const { base, vat } = splitGross(gross, rate.rate);
    return { grossAmount: gross, netAmount: base, vatAmount: vat };
  });

  const vatLines = [...grossByRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([code, gross]) => {
      const { base, vat } = splitGross(gross, vatRate(code)!.rate);
      return { code, base, amount: vat };
    });
  const totalAmount = computed.reduce((sum, line) => sum.add(line.grossAmount), ZERO);
  const netAmount =
    voucherClass === "C" ? totalAmount : vatLines.reduce((sum, line) => sum.add(line.base), ZERO);
  const vatAmount = vatLines.reduce((sum, line) => sum.add(line.amount), ZERO);
  if (totalAmount.lte(0)) throw new AmountError("El total del comprobante debe ser mayor a cero.");
  // ImpTotal is Double (13+2) in the manual.
  if (totalAmount.gte("10000000000000"))
    throw new AmountError("El total supera el máximo admitido.");

  return {
    lines: computed,
    untaxedAmount: ZERO,
    exemptAmount: ZERO,
    netAmount,
    vatAmount,
    otherTaxAmount: ZERO,
    totalAmount,
    vatLines,
  };
}
