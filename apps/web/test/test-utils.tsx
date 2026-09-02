import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../src/app/theme";

// Shared by any test rendering a single page in isolation (not the full
// router tree) — pages use <Link>/<NavLink>, which need a Router
// context, API-backed pages need a QueryClientProvider, and anything
// touching Header (ThemeSwitcher) needs a ThemeProvider. `initialEntries`
// defaults to ["/"] (the previous, implicit behavior) — pass a specific
// path for tests that assert on route-dependent rendering (active nav
// state, etc.).
export function renderWithProviders(ui: ReactElement, initialEntries: string[] = ["/"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}
