// Single source of truth for building wa.me links — no component should
// construct one by hand or duplicate a phone number. See
// components/ui/WhatsAppButton.tsx, the only consumer that should ever
// need this directly.
export function buildWhatsAppUrl(phoneNumber: string, message?: string): string {
  const digitsOnly = phoneNumber.replace(/[^\d]/g, "");
  const query = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digitsOnly}${query}`;
}
