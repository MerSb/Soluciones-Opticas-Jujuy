// Leaving the site for the payment provider (Payments V1 — D1). The
// checkout URL comes from our API, which already validated it; checking
// again here means a bad response can never turn into an open redirect.

export function isTrustedCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)mercadopago\.com(\.[a-z]{2})?$/.test(url.hostname);
  } catch {
    return false;
  }
}

/** An object (not a bare function) so tests can observe the navigation
 * without jsdom attempting it. */
export const externalNavigation = {
  assign(url: string): void {
    window.location.assign(url);
  },
};
