import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `defineConfig` from vitest/config (not plain vite) so this one file
// covers both the dev/build config and the test config — no separate
// vitest.config.ts needed, since apps/web already has a Vite pipeline
// apps/api doesn't.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
