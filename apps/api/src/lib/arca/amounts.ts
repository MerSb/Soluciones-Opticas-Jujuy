import { Prisma } from "@prisma/client";
import { type VoucherClass, vatRate } from "./codes.js";

// Amounts of a voucher, following the formulas of the WSFEv1 manual v4.8
// (FECAEDetRequest): ImpTotal = ImpTotConc + ImpOpEx + ImpNeto + ImpIVA +
// ImpTrib; for class C, ImpTotConc, ImpOpEx and ImpIVA are 0 and no Iva
// array is sent (ImpNeto is the subtotal). Only taxed lines exist for now:
// untaxed/exempt lines and other taxes (Tributos) wait for confirmation.

const ZERO = new Prisma.Decimal(0);
const round2 = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface AmountItemInput {
  quantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  vatRateCode: number | null;
}

export interface ItemAmounts {
  netAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
}

export interface VatLine {
  code: number;
  base: Prisma.Decimal;
  amount: Prisma.Decimal;
}

export interface VoucherAmounts {
  items: ItemAmounts[];
  untaxedAmount: Prisma.Decimal;
  exemptAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  otherTaxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  vatLines: VatLine[];
}

export class AmountError extends Error {}

/** Unit prices are net of VAT for A/B (VAT added on top) and final for C. */
export function computeVoucherAmounts(
  voucherClass: VoucherClass,
  items: AmountItemInput[],
): VoucherAmounts {
  if (items.length === 0) throw new AmountError("El comprobante necesita al menos un ítem.");
  const vatByCode = new Map<number, VatLine>();
  const computed = items.map((item, index) => {
    const net = round2(new Prisma.Decimal(item.quantity).mul(item.unitPrice));
    if (voucherClass === "C") {
      if (item.vatRateCode !== null) {
        throw new AmountError(`Ítem ${index + 1}: un comprobante C no lleva IVA discriminado.`);
      }
      return { netAmount: net, vatAmount: ZERO };
    }
    if (item.vatRateCode === null) {
      throw new AmountError(
        `Ítem ${index + 1}: falta el código de IVA (confirmarlo con el contador).`,
      );
    }
    const rate = vatRate(item.vatRateCode);
    if (!rate) throw new AmountError(`Ítem ${index + 1}: código de IVA desconocido.`);
    const line = vatByCode.get(item.vatRateCode) ?? {
      code: item.vatRateCode,
      base: ZERO,
      amount: ZERO,
    };
    vatByCode.set(item.vatRateCode, { ...line, base: line.base.add(net) });
    // Per-line VAT is shown on the PDF; what ARCA checks is each AlicIva
    // (base × rate), computed below from the summed base.
    return { netAmount: net, vatAmount: round2(net.mul(rate.rate)) };
  });
  for (const line of vatByCode.values()) {
    line.amount = round2(line.base.mul(vatRate(line.code)!.rate));
  }

  const netAmount = computed.reduce((sum, item) => sum.add(item.netAmount), ZERO);
  const vatAmount = [...vatByCode.values()].reduce((sum, line) => sum.add(line.amount), ZERO);
  const totalAmount = ZERO.add(netAmount).add(vatAmount);
  if (totalAmount.lte(0)) throw new AmountError("El total del comprobante debe ser mayor a cero.");
  // ImpTotal is Double (13+2) in the manual.
  if (totalAmount.gte("10000000000000"))
    throw new AmountError("El total supera el máximo admitido.");

  return {
    items: computed,
    untaxedAmount: ZERO,
    exemptAmount: ZERO,
    netAmount,
    vatAmount,
    otherTaxAmount: ZERO,
    totalAmount,
    vatLines: [...vatByCode.values()].sort((a, b) => a.code - b.code),
  };
}
