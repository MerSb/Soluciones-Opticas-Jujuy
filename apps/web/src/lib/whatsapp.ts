// Single source of truth for building wa.me links — no component should
// construct one by hand or duplicate a phone number. See
// components/ui/WhatsAppButton.tsx, the only consumer that should ever
// need this directly.
import { formatPrice } from "./format-price";

export function buildWhatsAppUrl(phoneNumber: string, message?: string): string {
  const digitsOnly = phoneNumber.replace(/[^\d]/g, "");
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digitsOnly}${query}`;
}

export interface WhatsAppProductContext {
  productName: string;
  brandName?: string | null;
  color?: string | null;
  /**
   * Absolute URL, e.g. `window.location.href` — never hardcode a
   * domain here (Customer Experience V2 §6): whichever domain the page
   * is actually served from at the time is what belongs in the
   * message, so this needs no change when a final domain is set up.
   */
  productUrl?: string | null;
  /** ADR-0028 — an accessory variant's presentation (e.g. a cleaner's size). */
  presentation?: string | null;
  /** ADR-0028 — "el accesorio" instead of "el modelo". */
  isAccessory?: boolean;
  /** ADR-0028 Phase 2 — only for a complete, server-quoted selection;
   * omitted otherwise so the message never promises an accessory. */
  includedAccessories?: {
    caseName: string | null;
    cordName: string | null;
    personalizedCordName: string | null;
    /** From the quote (ARS). */
    surcharge: number;
    estimatedTotal: number;
  } | null;
  /**
   * Lens configuration (ADR-0023) — only for products that offer lenses.
   * Omitted entirely for every other product, so their message stays
   * exactly as before. `lensTypeName: null` means the customer chose
   * "Sin cristales".
   */
  lens?: {
    lensTypeName: string | null;
    lensOptionName?: string | null;
    customGraduation?: boolean;
  } | null;
}

function accessoriesPhrase(accessories: WhatsAppProductContext["includedAccessories"]): string {
  if (!accessories) return "";
  const items = [
    accessories.caseName ? `estuche ${accessories.caseName} (incluido, sin cargo)` : null,
    accessories.cordName ? `cordón ${accessories.cordName} (incluido, sin cargo)` : null,
    accessories.personalizedCordName
      ? `cordón personalizado ${accessories.personalizedCordName} (+${formatPrice(accessories.surcharge)})`
      : null,
  ].filter(Boolean);
  const list = items.length > 0 ? ` Accesorios: ${items.join(", ")}.` : "";
  return `${list} Total estimado: ${formatPrice(accessories.estimatedTotal)}. Entiendo que la disponibilidad está sujeta a confirmación.`;
}

function lensPhrase(lens: WhatsAppProductContext["lens"]): string {
  if (!lens) return "";
  if (!lens.lensTypeName) return ", sin cristales";
  const option = lens.lensOptionName ? ` (variedad ${lens.lensOptionName})` : "";
  const graduation = lens.customGraduation ? " y graduación personalizada" : "";
  return `, con cristales ${lens.lensTypeName}${option}${graduation}`;
}

// Pure — no phone number needed — so a component that already renders
// <WhatsAppButton message={...}> (which reads the central
// siteContent.whatsappNumber itself) can build just the message text
// without duplicating that lookup. Every optional field is cleanly
// omitted from the sentence when absent, never rendered as
// "null"/"undefined"/"".
export function buildProductInquiryMessage({
  productName,
  brandName,
  color,
  presentation,
  isAccessory,
  productUrl,
  lens,
  includedAccessories,
}: WhatsAppProductContext): string {
  const productPhrase = brandName ? `${productName} de ${brandName}` : productName;
  const presentationPhrase = presentation ? `, presentación ${presentation}` : "";
  const colorPhrase = color ? `, color ${color}` : "";
  const linkPhrase = productUrl ? ` ${productUrl}` : "";
  const noun = isAccessory ? "el accesorio" : "el modelo";

  return `Hola, estoy interesado/a en ${noun} ${productPhrase}${presentationPhrase}${colorPhrase}${lensPhrase(lens)}.${accessoriesPhrase(includedAccessories)} ¿Podrían darme más información?${linkPhrase}`;
}

// Convenience wrapper for a call site that needs the full wa.me URL
// directly (not going through <WhatsAppButton>) — delegates to
// buildProductInquiryMessage + buildWhatsAppUrl, never builds either
// message or URL by hand a second time.
export function buildWhatsAppProductUrl(
  phoneNumber: string,
  context: WhatsAppProductContext,
): string {
  return buildWhatsAppUrl(phoneNumber, buildProductInquiryMessage(context));
}
