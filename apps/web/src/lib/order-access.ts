// Guest order access (Payments V1, docs/PAYMENTS.md). The token the API
// returns once at checkout is kept in sessionStorage — not localStorage,
// so it disappears when the browser session ends — under a namespaced
// key. It never goes into a URL, a query string, a log or analytics: it
// only ever leaves the browser in the X-Order-Access-Token header.
// Losing it (another browser, a closed session) only loses this
// shortcut; a future email/WhatsApp notification will let the buyer
// reopen the order without depending on sessionStorage.

const KEY_PREFIX = "soj:order-access:";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const orderAccessKey = (orderNumber: string) => `${KEY_PREFIX}${orderNumber}`;

export function saveOrderAccessToken(orderNumber: string, token: string): void {
  try {
    window.sessionStorage.setItem(orderAccessKey(orderNumber), token);
  } catch {
    // Storage unavailable: the order page will explain how to follow up.
  }
}

export function readOrderAccessToken(orderNumber: string): string | null {
  try {
    const token = window.sessionStorage.getItem(orderAccessKey(orderNumber));
    return token && TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}
