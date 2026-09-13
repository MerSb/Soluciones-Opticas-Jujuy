// Single source of truth for building wa.me links — no component should
// construct one by hand or duplicate a phone number. See
// components/ui/WhatsAppButton.tsx, the only consumer that should ever
// need this directly.
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
  productUrl,
  lens,
}: WhatsAppProductContext): string {
  const productPhrase = brandName ? `${productName} de ${brandName}` : productName;
  const colorPhrase = color ? `, color ${color}` : "";
  const linkPhrase = productUrl ? ` ${productUrl}` : "";

  return `Hola, estoy interesado/a en el modelo ${productPhrase}${colorPhrase}${lensPhrase(lens)}. ¿Podrían darme más información?${linkPhrase}`;
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
