// siteContent.phone is the one canonical display string — every place
// that shows a phone number renders it verbatim, never a re-formatted
// variant (see site-content.ts). A tel: URI needs digits only (plus a
// leading + for international format), which this derives on the fly
// rather than storing a second phone value to keep in sync.
export function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
