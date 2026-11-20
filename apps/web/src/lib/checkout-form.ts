import type { ArgentineProvinceCode, CheckoutOrderInput } from "@soluciones-opticas/shared";
import type { CartLine } from "./cart/cart";
import { CONSUMIDOR_FINAL, digitsOf, isDni, isValidCuit } from "./tax-id";

// Checkout form rules (Payments V1 — Phase C). The same formats the API
// validates (apps/api/src/schemas/checkout.schema.ts), checked here only
// to give immediate, field-level feedback — the API remains the
// authority and its answer always wins.

export type DeliveryChoice = "PICKUP" | "DELIVERY";

export interface CheckoutFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  deliveryMethod: DeliveryChoice;
  branchId: string;
  recipientName: string;
  streetName: string;
  streetNumber: string;
  floor: string;
  apartment: string;
  city: string;
  provinceCode: ArgentineProvinceCode | "";
  postalCode: string;
  references: string;
  /** ARCA IVA condition code; anything but final consumer needs a CUIT. */
  ivaConditionCode: number;
  /** Final consumer only: whether the invoice carries their DNI/CUIL. */
  invoiceRequested: boolean;
  billingName: string;
  billingTaxId: string;
  billingAddressLine: string;
}

export type CheckoutFormErrors = Partial<Record<keyof CheckoutFormValues, string>>;

export const EMPTY_CHECKOUT_FORM: CheckoutFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  deliveryMethod: "PICKUP",
  branchId: "",
  recipientName: "",
  streetName: "",
  streetNumber: "",
  floor: "",
  apartment: "",
  city: "",
  provinceCode: "",
  postalCode: "",
  references: "",
  ivaConditionCode: CONSUMIDOR_FINAL,
  invoiceRequested: false,
  billingName: "",
  billingTaxId: "",
  billingAddressLine: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?(?:[\s().-]*\d){6,15}[\s().-]*$/;
const POSTAL_CODE_PATTERN = /^(?:\d{4}|[A-HJ-NP-Z]\d{4}[A-Z]{3})$/;

/** Same order as the fields on screen — the first error gets focus. */
export const CHECKOUT_FIELD_ORDER: (keyof CheckoutFormValues)[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "branchId",
  "recipientName",
  "streetName",
  "streetNumber",
  "floor",
  "apartment",
  "city",
  "provinceCode",
  "postalCode",
  "references",
  "billingName",
  "billingTaxId",
  "billingAddressLine",
];

const required = (value: string) => value.trim().length > 0;

export function validateCheckoutForm(values: CheckoutFormValues): CheckoutFormErrors {
  const errors: CheckoutFormErrors = {};
  if (!required(values.firstName)) errors.firstName = "Ingresá tu nombre.";
  if (!required(values.lastName)) errors.lastName = "Ingresá tu apellido.";
  if (!required(values.email)) errors.email = "Ingresá tu email.";
  else if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = "Revisá el formato del email.";
  if (!required(values.phone)) {
    errors.phone = "Ingresá un teléfono: lo necesitamos para coordinar tu pedido.";
  } else if (!PHONE_PATTERN.test(values.phone.trim())) {
    errors.phone = "Revisá el teléfono (código de área y número, por ejemplo 388 400-0000).";
  }

  if (values.deliveryMethod === "PICKUP") {
    if (!values.branchId) errors.branchId = "Elegí dónde retirar tu pedido.";
  } else {
    if (!required(values.recipientName)) errors.recipientName = "Ingresá quién recibe el pedido.";
    if (!required(values.streetName)) errors.streetName = "Ingresá la calle.";
    if (!required(values.streetNumber)) errors.streetNumber = "Ingresá la altura.";
    if (!required(values.city)) errors.city = "Ingresá la localidad.";
    if (!values.provinceCode) errors.provinceCode = "Elegí la provincia.";
    if (!required(values.postalCode)) errors.postalCode = "Ingresá el código postal.";
    else if (!POSTAL_CODE_PATTERN.test(values.postalCode.trim().toUpperCase())) {
      errors.postalCode = "Usá 4 dígitos (4600) o el CPA completo (Y4600ABC).";
    }
  }

  const consumer = values.ivaConditionCode === CONSUMIDOR_FINAL;
  if (!consumer || values.invoiceRequested) {
    if (!required(values.billingName)) {
      errors.billingName = consumer ? "Ingresá tu nombre completo." : "Ingresá la razón social.";
    }
    const id = values.billingTaxId.trim();
    if (!required(id)) {
      errors.billingTaxId = consumer ? "Ingresá tu DNI o CUIL." : "Ingresá el CUIT.";
    } else if (consumer ? !(isDni(id) || isValidCuit(id)) : !isValidCuit(id)) {
      errors.billingTaxId = consumer
        ? "Revisá el número: DNI de 7-8 dígitos o CUIL de 11."
        : "El CUIT no es válido: revisá los 11 dígitos.";
    }
  }
  return errors;
}

const optional = (value: string) => (value.trim() === "" ? null : value.trim());

/** The exact API contract: ids, contact data and quantities — never a
 * price, a total, a stock figure, a status or a user id. */
export function buildCheckoutInput(
  values: CheckoutFormValues,
  lines: CartLine[],
): CheckoutOrderInput {
  return {
    customer: {
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
    },
    delivery:
      values.deliveryMethod === "PICKUP"
        ? { method: "PICKUP", branchId: values.branchId }
        : {
            method: "DELIVERY",
            address: {
              recipientName: values.recipientName.trim(),
              streetName: values.streetName.trim(),
              streetNumber: values.streetNumber.trim(),
              floor: optional(values.floor),
              apartment: optional(values.apartment),
              city: values.city.trim(),
              provinceCode: values.provinceCode as ArgentineProvinceCode,
              postalCode: values.postalCode.trim().toUpperCase(),
              references: optional(values.references),
            },
          },
    billing:
      values.ivaConditionCode !== CONSUMIDOR_FINAL || values.invoiceRequested
        ? {
            invoiceRequested: true,
            billingName: values.billingName.trim(),
            billingTaxId: values.billingTaxId.trim(),
            billingAddressLine: optional(values.billingAddressLine),
            ivaConditionCode: values.ivaConditionCode,
            // An 11-digit number from a final consumer is a CUIL; anyone
            // else invoices with their CUIT.
            ...(digitsOf(values.billingTaxId).length === 11
              ? { billingDocType: values.ivaConditionCode === CONSUMIDOR_FINAL ? 86 : 80 }
              : {}),
          }
        : { invoiceRequested: false },
    items: lines.map((line) => ({
      productSlug: line.productSlug,
      variantId: line.variantId,
      ...(line.lensTypeId ? { lensTypeId: line.lensTypeId, lensOptionId: line.lensOptionId } : {}),
      graduationMode: line.graduationMode,
      quantity: line.quantity,
    })),
  };
}
