// Audit point 19 — analytics, prepared and OFF by default.
//
// Nothing is loaded or sent unless ALL of:
//  1. VITE_GA4_MEASUREMENT_ID is set at build time (no ID is invented;
//     unset = no banner, no script, track() does nothing),
//  2. the cookie policy is approved and published (content/legal/status.ts)
//     — the banner links to it and the visitor changes their choice there,
//  3. the visitor accepted analytics in the consent banner.
// Google's script is injected only after that consent, never before.
// Events carry no personal data: product slugs, kinds, colors and paths.

import { COOKIE_POLICY_APPROVED } from "../content/legal/status";

export type AnalyticsEvent =
  | { name: "view_item"; params: { item_id: string; item_category: "FRAME" | "ACCESSORY" } }
  | { name: "select_variant"; params: { item_id: string; variant: string } }
  | { name: "whatsapp_click"; params: { page_path: string; item_id?: string } }
  | { name: "catalog_click"; params: { source: string } };

export type ConsentChoice = "granted" | "denied";

const CONSENT_KEY = "sopt-analytics-consent";
let loaded = false;

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

/** The configured GA4 ID, or null when analytics is not set up. */
export function analyticsId(): string | null {
  if (!COOKIE_POLICY_APPROVED) return null;
  const id = import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined;
  return id && /^G-[A-Z0-9]+$/.test(id) ? id : null;
}

export function storedConsent(): ConsentChoice | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function setConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Storage blocked: the choice applies to this page view only.
  }
  if (choice === "granted") loadAnalytics();
}

/** Injects gtag.js once — only with an ID and granted consent. */
export function loadAnalytics(): boolean {
  const id = analyticsId();
  if (loaded || !id || storedConsent() !== "granted" || typeof document === "undefined") {
    return loaded;
  }
  const w = window as GtagWindow;
  w.dataLayer = w.dataLayer ?? [];
  w.gtag = function gtag() {
    // gtag.js reads the `arguments` object itself.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag("js", new Date());
  // No ad signals, no user-ID: page views and the events below only.
  w.gtag("config", id, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.dataset.analytics = "ga4";
  document.head.appendChild(script);
  loaded = true;
  return true;
}

/** Sends an event if analytics is configured and accepted; otherwise nothing. */
export function track(event: AnalyticsEvent): void {
  if (!analyticsId() || storedConsent() !== "granted") return;
  if (!loaded) loadAnalytics();
  (window as GtagWindow).gtag?.("event", event.name, event.params);
}

/** Tests only. */
export function resetAnalyticsForTests(): void {
  loaded = false;
  const w = window as GtagWindow;
  delete w.gtag;
  delete w.dataLayer;
  document.querySelectorAll('script[data-analytics="ga4"]').forEach((node) => node.remove());
}
