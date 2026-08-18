import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// @testing-library/react's own auto-cleanup detects a global `afterEach`
// — this project imports test functions explicitly from "vitest" rather
// than enabling globals, so that detection never fires. Registered
// explicitly here instead of flipping on `test.globals` project-wide.
afterEach(() => {
  cleanup();
});

// jsdom implements neither of these at all (matchMedia exists as a
// property but throws when called; scrollIntoView is entirely absent)
// — every real browser supports both, confirmed in this step's live
// Chromium verification. Unconditional stubs here, not a defensive
// `typeof` check in the source, since this is purely a test-environment
// gap, not something that can happen in production.
window.HTMLElement.prototype.scrollIntoView = () => {};
window.matchMedia = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

// jsdom doesn't implement <dialog>'s imperative methods at all
// (showModal/close are entirely absent — this is the same category of
// gap as the two above). This is a minimal polyfill covering exactly
// what FilterDrawer needs (open state + a `close` event on close),
// not a full implementation — it deliberately does NOT attempt to
// simulate native focus-trapping or Escape-triggers-`cancel`, since
// jsdom has no real layout/rendering to trap focus within in the first
// place. Tests that need to simulate Escape closing the dialog
// dispatch the `cancel` event directly instead of pressing the key —
// that's the piece jsdom can't fake, not the app's own behavior.
if (typeof window.HTMLDialogElement !== "undefined") {
  window.HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  window.HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
