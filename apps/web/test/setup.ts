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
