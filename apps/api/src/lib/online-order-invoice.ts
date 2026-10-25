import { Prisma } from "@prisma/client";
import {
  RECEPTOR_IVA_CONDITIONS,
  UNIDENTIFIED_DOC_TYPE,
  voucherTypeInfo,
  type VoucherClass,
} from "./arca/codes.js";

// The contract between the online checkout and invoicing (ADR-0036).
//
// `PaidOnlineOrder` mirrors the Order / OrderItem / Payment models of the
// checkout branch (feature/payments-v1, ADR-0025/0026/0027), which is not
// integrated yet: the adapter that reads a real order and calls
// receivePaidOrder() is written when both meet. Invoicing never trusts
// the browser, a redirect or a webhook body: it only accepts an order the
// checkout already reconciled with the payment provider (status PAID,
// payment APPROVED for exactly the order total).
//
// planVoucher() turns that order into what the voucher needs — or says
// precisely what is missing. It never guesses a fiscal fact.

export interface PaidOnlineOrderItem {
  /** "FRAME" | "ACCESSORY" (Product.kind, read by the adapter). */
  productKind: "FRAME" | "ACCESSORY";
  productName: string;
  variantSku: string;
  variantColor: string | null;
  lensTypeName: string | null;
  lensOptionName: string | null;
  /** Prices as paid, VAT included (OrderItem.framePrice / lensPrice). */
  framePrice: string;
  lensPrice: string;
  quantity: number;
  lineTotal: string;
}

export interface PaidOnlineOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  currency: string;
  grandTotal: string;
  customerShippingPrice: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  /** Billing data as the checkout collects it today (no IVA condition). */
  invoiceRequested: boolean;
  billingName: string | null;
  billingTaxId: string | null;
  billingAddressLine: string | null;
  payment: {
    provider: string;
    status: string;
    providerPaymentId: string;
    amount: string;
    currency: string;
    approvedAt: string;
  };
  items: PaidOnlineOrderItem[];
}

/** Why an order cannot be invoiced automatically at all. */
export function refuseUnverifiedOrder(order: PaidOnlineOrder): string | null {
  if (order.status !== "PAID") return "El pedido no figura como pagado.";
  if (order.payment.status !== "APPROVED") return "El pago no figura como aprobado.";
  if (order.currency !== "ARS" || order.payment.currency !== "ARS") {
    return "Solo se facturan pedidos en pesos.";
  }
  if (!new Prisma.Decimal(order.payment.amount).eq(order.grandTotal)) {
    return "El monto pagado no coincide con el total del pedido.";
  }
  if (!order.payment.providerPaymentId) return "Falta la referencia del pago.";
  return null;
}

export interface IssuerFiscalSetup {
  frameVatRateCode: number | null;
  lensVatRateCode: number | null;
  accessoryVatRateCode: number | null;
  finalConsumerIdThreshold: Prisma.Decimal | null;
}

export interface CompletedReceptorData {
  receptorIvaConditionCode: number | null;
  receptorDocType: number | null;
}

export interface PlannedLine {
  description: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  vatRateCode: number | null;
  variantSku: string | null;
}

export type VoucherPlan =
  | {
      ok: true;
      voucherType: number;
      receptor: {
        docType: number;
        docNumber: string;
        name: string;
        ivaConditionCode: number;
        address: string | null;
      };
      lines: PlannedLine[];
    }
  | { ok: false; reason: string };

const CONSUMIDOR_FINAL = 5;
const DNI = 96;

/**
 * - No invoice data requested → final consumer; unidentified (doc 99) only
 *   below the configured threshold.
 * - A 7–8 digit document is a DNI: only a final consumer has no CUIT.
 * - An 11 digit number (CUIT/CUIL) needs the buyer's IVA condition, which
 *   the checkout does not ask today: an admin completes it.
 * - The voucher type is the only enabled type of the online point of sale
 *   whose class the receptor may receive (annex of manual v4.8).
 */
export function planVoucher(
  order: PaidOnlineOrder,
  setup: IssuerFiscalSetup,
  enabledVoucherTypes: number[],
  completed: CompletedReceptorData,
): VoucherPlan {
  const total = new Prisma.Decimal(order.grandTotal);
  const buyerName = `${order.customerFirstName} ${order.customerLastName}`.trim();

  let receptor: Extract<VoucherPlan, { ok: true }>["receptor"];
  const taxId = order.invoiceRequested ? (order.billingTaxId ?? "").replace(/\D/g, "") : "";
  if (!order.invoiceRequested || taxId === "") {
    const threshold = setup.finalConsumerIdThreshold;
    if (threshold === null) {
      return {
        ok: false,
        reason:
          "Falta configurar desde qué monto hay que identificar al consumidor final, y el comprador no dejó su documento.",
      };
    }
    if (total.gte(threshold)) {
      return {
        ok: false,
        reason: "Por el monto hay que identificar al comprador: falta su DNI o CUIT.",
      };
    }
    receptor = {
      docType: UNIDENTIFIED_DOC_TYPE,
      docNumber: "0",
      name: buyerName,
      ivaConditionCode: CONSUMIDOR_FINAL,
      address: null,
    };
  } else if (taxId.length === 7 || taxId.length === 8) {
    receptor = {
      docType: DNI,
      docNumber: taxId,
      name: order.billingName ?? buyerName,
      ivaConditionCode: CONSUMIDOR_FINAL,
      address: order.billingAddressLine,
    };
  } else if (taxId.length === 11) {
    const condition = completed.receptorIvaConditionCode;
    const docType = completed.receptorDocType;
    if (condition === null || docType === null) {
      return {
        ok: false,
        reason:
          "El comprador indicó CUIT/CUIL: falta su condición frente al IVA y si el número es CUIT o CUIL (el checkout no lo pregunta).",
      };
    }
    receptor = {
      docType,
      docNumber: taxId,
      name: order.billingName ?? buyerName,
      ivaConditionCode: condition,
      address: order.billingAddressLine,
    };
  } else {
    return { ok: false, reason: "El documento del comprador no tiene un formato válido." };
  }

  const allowed =
    RECEPTOR_IVA_CONDITIONS[receptor.ivaConditionCode as keyof typeof RECEPTOR_IVA_CONDITIONS];
  if (!allowed) return { ok: false, reason: "Condición frente al IVA del comprador desconocida." };
  const candidates = enabledVoucherTypes.filter((code) => {
    const info = voucherTypeInfo(code);
    return info && (allowed.classes as readonly VoucherClass[]).includes(info.class);
  });
  if (candidates.length !== 1) {
    return {
      ok: false,
      reason:
        candidates.length === 0
          ? `Ningún tipo habilitado en el punto de venta online corresponde a un comprador «${allowed.name}».`
          : `Más de un tipo habilitado corresponde a un comprador «${allowed.name}»: revisar la configuración.`,
    };
  }
  const voucherType = candidates[0]!;
  const voucherClass = voucherTypeInfo(voucherType)!.class;

  if (!new Prisma.Decimal(order.customerShippingPrice).eq(0)) {
    return { ok: false, reason: "El pedido cobra envío: falta definir cómo se factura." };
  }
  const rateFor = (kind: "FRAME" | "LENS" | "ACCESSORY") => {
    if (voucherClass === "C") return null;
    return kind === "FRAME"
      ? setup.frameVatRateCode
      : kind === "LENS"
        ? setup.lensVatRateCode
        : setup.accessoryVatRateCode;
  };

  const lines: PlannedLine[] = [];
  for (const item of order.items) {
    const kind = item.productKind === "ACCESSORY" ? "ACCESSORY" : "FRAME";
    const parts: [Prisma.Decimal, string, "FRAME" | "LENS" | "ACCESSORY"][] = [
      [
        new Prisma.Decimal(item.framePrice),
        [item.productName, item.variantColor].filter(Boolean).join(" — "),
        kind,
      ],
      [
        new Prisma.Decimal(item.lensPrice),
        `Cristales: ${[item.lensTypeName, item.lensOptionName].filter(Boolean).join(" — ")}`,
        "LENS",
      ],
    ];
    for (const [price, description, partKind] of parts) {
      if (price.eq(0) && partKind === "LENS") continue;
      const vatRateCode = rateFor(partKind);
      if (voucherClass !== "C" && vatRateCode === null) {
        const label =
          partKind === "FRAME" ? "armazones" : partKind === "LENS" ? "cristales" : "accesorios";
        return {
          ok: false,
          reason: `Falta la alícuota de IVA de ${label} (la define el contador).`,
        };
      }
      lines.push({
        description,
        quantity: item.quantity,
        unitPrice: price,
        vatRateCode,
        variantSku: partKind === "LENS" ? null : item.variantSku,
      });
    }
  }
  const sum = lines.reduce(
    (acc, line) => acc.add(line.unitPrice.mul(line.quantity)),
    new Prisma.Decimal(0),
  );
  if (!sum.eq(total)) {
    return {
      ok: false,
      reason: "Los ítems del pedido no suman el total pagado: revisar el pedido.",
    };
  }
  return { ok: true, voucherType, receptor, lines };
}
