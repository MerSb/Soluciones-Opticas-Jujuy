import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  analyticsId,
  loadAnalytics,
  resetAnalyticsForTests,
  setConsent,
  track,
} from "../src/lib/analytics";
import { AnalyticsConsent, AnalyticsPreference } from "../src/components/layout/AnalyticsConsent";

// Audit points 3 and 19 — analytics stays off unless an ID is configured,
// the cookie policy is approved AND the visitor accepts; nothing is loaded
// before consent.

// The cookie policy's approval flag, switchable per test (today: false).
const legal = vi.hoisted(() => ({ cookiePolicyApproved: false }));
vi.mock("../src/content/legal/status", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/content/legal/status")>()),
  get COOKIE_POLICY_APPROVED() {
    return legal.cookiePolicyApproved;
  },
}));

const scripts = () => document.querySelectorAll('script[data-analytics="ga4"]');
type W = Window & { dataLayer?: IArguments[] };

beforeEach(() => {
  localStorage.clear();
  resetAnalyticsForTests();
  legal.cookiePolicyApproved = true;
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetAnalyticsForTests();
  localStorage.clear();
});

describe("with an ID but the cookie policy not approved yet (today)", () => {
  it("is off: the banner would link to a page that isn't published", () => {
    legal.cookiePolicyApproved = false;
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "G-TEST123");
    expect(analyticsId()).toBeNull();
    render(
      <MemoryRouter>
        <AnalyticsConsent />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("region", { name: "Preferencias de analítica" })).toBeNull();
    localStorage.setItem("sopt-analytics-consent", "granted");
    track({ name: "catalog_click", params: { source: "test" } });
    expect(loadAnalytics()).toBe(false);
    expect(scripts()).toHaveLength(0);
  });
});

describe("without a measurement ID (today's configuration)", () => {
  it("is off: no banner, no script, track() does nothing", () => {
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "");
    expect(analyticsId()).toBeNull();
    render(
      <MemoryRouter>
        <AnalyticsConsent />
        <AnalyticsPreference />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("region", { name: "Preferencias de analítica" })).toBeNull();
    expect(screen.queryByText("Tu elección sobre analítica")).toBeNull();
    localStorage.setItem("sopt-analytics-consent", "granted");
    track({ name: "catalog_click", params: { source: "test" } });
    expect(loadAnalytics()).toBe(false);
    expect(scripts()).toHaveLength(0);
    expect((window as W).dataLayer).toBeUndefined();
  });

  it("ignores IDs that aren't GA4 measurement IDs", () => {
    vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "UA-123");
    expect(analyticsId()).toBeNull();
  });
});

describe("with a measurement ID", () => {
  beforeEach(() => vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "G-TEST123"));

  it("asks first, with accept and reject equally prominent; nothing loads before consent", () => {
    render(
      <MemoryRouter>
        <AnalyticsConsent />
      </MemoryRouter>,
    );
    const banner = screen.getByRole("region", { name: "Preferencias de analítica" });
    const accept = screen.getByRole("button", { name: "Aceptar" });
    const reject = screen.getByRole("button", { name: "Rechazar" });
    expect(accept.className).toBe(reject.className);
    expect(banner).toBeInTheDocument();
    track({ name: "catalog_click", params: { source: "test" } });
    expect(scripts()).toHaveLength(0);
  });

  it("reject: nothing loads, the banner goes away", async () => {
    render(
      <MemoryRouter>
        <AnalyticsConsent />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    expect(screen.queryByRole("region", { name: "Preferencias de analítica" })).toBeNull();
    expect(localStorage.getItem("sopt-analytics-consent")).toBe("denied");
    track({ name: "catalog_click", params: { source: "test" } });
    expect(scripts()).toHaveLength(0);
  });

  it("accept: gtag loads once, without ad signals; events carry no personal data", async () => {
    render(
      <MemoryRouter>
        <AnalyticsConsent />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]).toHaveAttribute(
      "src",
      "https://www.googletagmanager.com/gtag/js?id=G-TEST123",
    );
    loadAnalytics();
    expect(scripts()).toHaveLength(1);
    track({ name: "view_item", params: { item_id: "limpiador-40ml", item_category: "ACCESSORY" } });
    const calls = (window as W).dataLayer!.map((args) => [...args]);
    expect(calls).toContainEqual([
      "config",
      "G-TEST123",
      { allow_google_signals: false, allow_ad_personalization_signals: false },
    ]);
    expect(calls).toContainEqual([
      "event",
      "view_item",
      { item_id: "limpiador-40ml", item_category: "ACCESSORY" },
    ]);
    expect(JSON.stringify(calls)).not.toMatch(/@|email|phone|name"/);
  });

  it("the choice can be changed later from the cookie policy", async () => {
    setConsent("denied");
    render(<AnalyticsPreference />);
    expect(screen.getByRole("status")).toHaveTextContent("Rechazaste la analítica.");
    await userEvent.click(screen.getByRole("button", { name: "Aceptar analítica" }));
    expect(screen.getByRole("status")).toHaveTextContent("Aceptaste la analítica.");
    expect(scripts()).toHaveLength(1);
  });
});
