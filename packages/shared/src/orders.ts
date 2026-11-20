// Payments V1 — order and checkout contracts. See
// docs/adr/0025-order-domain-and-stock-reservation.md and
// docs/PAYMENTS.md. Type-only (ADR-0015). Money is a number here, as in
// every DTO: the API computes it as Decimal and converts only when
// serializing.

import type { ArgentineProvinceCode, DeliveryMethod } from "./shipping.js";
import type { GraduationMode } from "./lens.js";

export type OrderStatus =
  "PENDING_PAYMENT" | "PAID" | "PAID_NEEDS_REVIEW" | "CANCELLED" | "EXPIRED";

/** Status of one payment attempt (a Payment row). */
export type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "REFUNDED";

/** What an order DTO reports about payment: the latest attempt's status,
 * or NOT_STARTED while the order has no Payment row at all. NOT_STARTED
 * is a DTO value only — no Payment row is ever created to represent it. */
export type OrderPaymentStatus = "NOT_STARTED" | PaymentStatus;

/** One checkout line: ids, mode and quantity only. The backend derives
 * every name, price and total (resolveEyewearConfiguration). */
export interface CheckoutItemInput {
  productSlug: string;
  variantId: string;
  lensTypeId?: string | null;
  lensOptionId?: string | null;
  graduationMode?: GraduationMode;
  quantity: number;
}

export interface CheckoutDeliveryAddressInput {
  recipientName: string;
  streetName: string;
  streetNumber: string;
  floor?: string | null;
  apartment?: string | null;
  city: string;
  provinceCode: ArgentineProvinceCode;
  postalCode: string;
  references?: string | null;
}

export type CheckoutDeliveryInput =
  | { method: "PICKUP"; branchId: string }
  | { method: "DELIVERY"; address: CheckoutDeliveryAddressInput };

export type CheckoutBillingInput =
  | { invoiceRequested: false }
  | {
      invoiceRequested: true;
      billingName: string;
      billingTaxId: string;
      billingAddressLine?: string | null;
      /** ARCA IVA condition code (5 CF, 1 RI, 6 Monotributo, 4 Exento). */
      ivaConditionCode?: number;
      /** For an 11-digit number: CUIT (80) or CUIL (86). */
      billingDocType?: 80 | 86;
    };

/** POST /api/checkout/orders */
export interface CheckoutOrderInput {
  customer: { firstName: string; lastName: string; email: string; phone: string };
  delivery: CheckoutDeliveryInput;
  billing?: CheckoutBillingInput;
  items: CheckoutItemInput[];
}

export interface CheckoutOrderResponse {
  orderNumber: string;
  /** Guest checkout only, returned exactly once: send it back in the
   * X-Order-Access-Token header to view the order. Absent for an
   * authenticated checkout (the account's order history is the access). */
  accessToken?: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  currency: string;
  itemsSubtotal: number;
  /** What the customer pays for shipping (0 under FREE_NATIONAL_V1). */
  customerShippingPrice: number;
  grandTotal: number;
  requiresOpticalConsultation: boolean;
  stockReservedUntil: string;
}

export interface PublicOrderItemDto {
  productName: string;
  productSlug: string;
  variantSku: string;
  variantColor: string | null;
  variantMaterial: string | null;
  lens: { typeName: string; optionName: string | null; treatments: string[] } | null;
  graduationMode: GraduationMode;
  requiresOpticalConsultation: boolean;
  framePrice: number;
  lensPrice: number;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export type PublicOrderDeliveryDto =
  | { method: "PICKUP"; branchName: string | null; address: string | null }
  | {
      method: "DELIVERY";
      address: {
        recipientName: string | null;
        streetName: string | null;
        streetNumber: string | null;
        floor: string | null;
        apartment: string | null;
        city: string | null;
        provinceCode: string | null;
        postalCode: string | null;
        references: string | null;
      };
    };

/** The buyer's own view of an order — guest (token) or account. Never
 * carries internal shipping costs, token hashes, payment ids or keys. */
export interface PublicOrderDto {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  createdAt: string;
  /** Only while the order is PENDING_PAYMENT; null otherwise. */
  stockReservedUntil: string | null;
  customer: { firstName: string; lastName: string; email: string; phone: string | null };
  delivery: PublicOrderDeliveryDto;
  billing: {
    invoiceRequested: boolean;
    billingName: string | null;
    billingTaxId: string | null;
    billingAddressLine: string | null;
  };
  requiresOpticalConsultation: boolean;
  items: PublicOrderItemDto[];
  currency: string;
  itemsSubtotal: number;
  customerShippingPrice: number;
  grandTotal: number;
}

export interface AccountOrderSummaryDto {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  createdAt: string;
  deliveryMethod: DeliveryMethod;
  itemCount: number;
  currency: string;
  grandTotal: number;
}
