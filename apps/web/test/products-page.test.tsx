import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductsPage } from "../src/pages/ProductsPage";

const BASE_PRODUCT = {
  brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
  category: { name: "Anteojos de Sol", slug: "anteojos-de-sol" },
  shape: "aviator",
  styles: [],
  frameMeasurements: {
    lensWidth: 58,
    bridgeWidth: 14,
    templeLength: 140,
    lensHeight: 50,
    frameWidth: 138,
  },
  colors: ["Negro"],
  image: null,
};

const PRODUCTS = [
  { ...BASE_PRODUCT, name: "Andina Aviador", slug: "andina-aviador", price: 45000 },
  {
    ...BASE_PRODUCT,
    name: "Cielo Runner",
    slug: "cielo-runner",
    price: 52000,
    brand: { name: "Cielo Frames", slug: "cielo-frames" },
  },
];

function mockCatalogFetch() {
  return vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));

    if (url.pathname === "/api/brands") {
      return {
        ok: true,
        json: async () => ({
          data: [
            {
              name: "Andina Eyewear",
              slug: "andina-eyewear",
              logoPublicId: null,
              description: null,
              productCount: 1,
            },
          ],
        }),
      };
    }
    if (url.pathname === "/api/categories") {
      return {
        ok: true,
        json: async () => ({
          data: [{ name: "Anteojos de Sol", slug: "anteojos-de-sol", productCount: 2 }],
        }),
      };
    }
    if (url.pathname === "/api/products") {
      const q = url.searchParams.get("q");
      const brand = url.searchParams.get("brand");
      let items = PRODUCTS;
      if (q) items = items.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
      if (brand) items = items.filter((p) => p.brand.slug === brand);
      return {
        ok: true,
        json: async () => ({
          data: items,
          pagination: { page: 1, limit: 12, total: items.length, totalPages: 1 },
        }),
      };
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: { code: "NOT_FOUND", message: "Not found" } }),
    };
  });
}

function renderProductsPage(initialPath = "/products") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/products", element: <ProductsPage /> }], {
    initialEntries: [initialPath],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProductsPage", () => {
  it("renders real products from the API and the result count", async () => {
    vi.stubGlobal("fetch", mockCatalogFetch());
    renderProductsPage();

    expect(await screen.findByText("Andina Aviador")).toBeInTheDocument();
    expect(screen.getByText("Cielo Runner")).toBeInTheDocument();
    expect(screen.getByText("2 resultados")).toBeInTheDocument();
  });

  it("shows an error state with a retry action when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: "INTERNAL_ERROR", message: "Boom" } }),
      }),
    );
    renderProductsPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos cargar el catálogo/i);
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  it("shows an empty state with a clear-filters action for a valid empty result", async () => {
    vi.stubGlobal("fetch", mockCatalogFetch());
    const router = renderProductsPage("/products?q=xyz-no-match");

    expect(
      await screen.findByText(/no encontramos anteojos con esos filtros/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /limpiar filtros/i }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("reflects a search in the URL after the debounce", async () => {
    vi.stubGlobal("fetch", mockCatalogFetch());
    const router = renderProductsPage();
    await screen.findByText("Andina Aviador");

    await userEvent.type(screen.getByLabelText(/buscar por modelo o marca/i), "Runner");
    await waitFor(() => expect(router.state.location.search).toBe("?q=Runner"), { timeout: 2000 });
    expect(await screen.findByText("Cielo Runner")).toBeInTheDocument();
  });

  it("reflects a brand filter in the URL and resets to page 1", async () => {
    vi.stubGlobal("fetch", mockCatalogFetch());
    const router = renderProductsPage("/products?page=2");
    await screen.findByText("Andina Aviador");

    // FilterSidebar (desktop) and the FilterDrawer's fields (mobile) are
    // both always mounted (CSS, not conditional rendering, decides
    // visibility) — "Marca" is a legitimate duplicate label, so target
    // the desktop instance by id (see FilterFields' idPrefix).
    await userEvent.selectOptions(
      document.querySelector("#filter-desktop-brand")!,
      "andina-eyewear",
    );
    await waitFor(() => expect(router.state.location.search).toBe("?brand=andina-eyewear"));
    expect(await screen.findByRole("button", { name: /andina eyewear/i })).toBeInTheDocument();
  });

  it("removing a filter chip clears that filter from the URL", async () => {
    vi.stubGlobal("fetch", mockCatalogFetch());
    const router = renderProductsPage("/products?brand=andina-eyewear");
    await screen.findByRole("button", { name: /andina eyewear/i });

    await userEvent.click(screen.getByRole("button", { name: /andina eyewear/i }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("reflects sort in the URL", async () => {
    vi.stubGlobal("fetch", mockCatalogFetch());
    const router = renderProductsPage();
    await screen.findByText("Andina Aviador");

    // Both the mobile and desktop toolbars render a SortSelect at once
    // (CSS, not conditional mounting, picks which is visible) — each
    // has a distinct id but the same accessible name, by design (see
    // SortSelect's id prop comment), so disambiguate by id here.
    await userEvent.selectOptions(document.querySelector("#catalog-sort-desktop")!, "price_desc");
    await waitFor(() => expect(router.state.location.search).toContain("sort=price_desc"));
  });

  it("does not crash on invalid URL params — falls back to safe defaults", async () => {
    vi.stubGlobal("fetch", mockCatalogFetch());
    renderProductsPage("/products?page=-5&minPrice=abc&sort=not-a-real-sort");

    expect(await screen.findByRole("heading", { level: 1, name: "Anteojos" })).toBeInTheDocument();
    expect(await screen.findByText("Andina Aviador")).toBeInTheDocument();
  });

  // Regression test: an earlier version of the page-change scroll effect
  // used an "is this the first render" ref flipped inside the effect
  // body — a pattern StrictMode's dev-mode double-invocation of effects
  // defeats (the second call sees the flag already flipped by the
  // first, and scrolls anyway). Confirmed live it pushed the skip-link
  // off-screen on first load. This asserts the fixed behavior directly:
  // no scroll on mount, a scroll only once page actually changes.
  it("does not scroll on initial mount, only when the page actually changes", async () => {
    vi.stubGlobal("fetch", mockCatalogFetch());
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    // Starting on page 2: a filter change resets to page 1, a genuine
    // 2 -> 1 transition. (Starting on page 1 and filtering stays on
    // page 1 — no real change, correctly no scroll, which an earlier
    // version of this test mistakenly asserted against.)
    renderProductsPage("/products?page=2");
    await screen.findByText("Andina Aviador");
    expect(scrollIntoView).not.toHaveBeenCalled();

    await userEvent.selectOptions(
      document.querySelector("#filter-desktop-brand")!,
      "andina-eyewear",
    );
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  });

  // Regression tests: the mobile filter drawer unmounts its <dialog> on
  // close rather than persisting it, which means the browser's native
  // "return focus to whatever opened the dialog" doesn't reliably fire
  // — confirmed live it left focus on <body>. Each of the three ways to
  // close it must land focus back on the trigger button explicitly. One
  // fresh render per case — reopening the same dialog repeatedly inside
  // a single test hits real jsdom limitations around showModal() mount
  // cycles that don't reproduce in an actual browser (verified live).
  //
  // Escape dispatches `cancel` directly rather than pressing the key —
  // jsdom has no real interactive dialog behavior to translate a
  // keypress into that native event (see test/setup.ts); the actual
  // Escape-closes-the-dialog behavior is a browser guarantee, already
  // verified live, not something this suite needs to re-prove.
  it.each([
    [
      "the × close button",
      async () => userEvent.click(screen.getByRole("button", { name: /cerrar filtros/i })),
    ],
    [
      "Escape (cancel event)",
      async () => screen.getByRole("dialog").dispatchEvent(new Event("cancel")),
    ],
    [
      "the 'Ver resultados' button",
      async () => userEvent.click(screen.getByRole("button", { name: /ver \d+ resultados/i })),
    ],
  ])("returns focus to the Filtros button when closed via %s", async (_label, close) => {
    vi.stubGlobal("fetch", mockCatalogFetch());
    renderProductsPage();
    await screen.findByText("Andina Aviador");

    await userEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    await screen.findByRole("dialog");

    await close();
    await waitFor(() => expect(screen.getByRole("button", { name: /^Filtros/ })).toHaveFocus());
  });
});
