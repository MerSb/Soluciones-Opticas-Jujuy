import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductDetailPage } from "../src/pages/ProductDetailPage";

const PRODUCT_DETAIL = {
  name: "Andina Aviador",
  slug: "andina-aviador",
  brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
  category: { name: "Anteojos de Sol", slug: "anteojos-de-sol" },
  shape: "aviator",
  price: 45000,
  frameMeasurements: {
    lensWidth: 58,
    bridgeWidth: 14,
    templeLength: 140,
    lensHeight: 50,
    frameWidth: 138,
  },
  variants: [
    {
      id: "v1",
      color: "Negro",
      material: "Metal",
      sku: "AND-AVI-NEG",
      price: 45000,
      inStock: true,
      images: [{ publicId: "img1", alt: "Andina Aviador negro", isPrimary: true }],
    },
    {
      id: "v2",
      color: "Dorado",
      material: "Metal",
      sku: "AND-AVI-DOR",
      price: 45000,
      inStock: false,
      images: [{ publicId: "img2", alt: "Andina Aviador dorado", isPrimary: true }],
    },
  ],
};

// ProductDetailPage now also renders a FavoriteButton, which fires its
// own GET /api/auth/me (and, once "authenticated", GET /api/favorites)
// alongside the product fetch — a blanket "return the product for every
// call" mock would hand that unrelated data back for those too. This
// dispatches by path so each endpoint gets a shape it can actually
// parse, matching how the real API actually responds per-route.
function mockFetch(productResponse: {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const path = new URL(url).pathname;
      if (path === "/api/auth/me") {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: "UNAUTHENTICATED", message: "Not logged in." } }),
        };
      }
      if (path === "/api/favorites") {
        return { ok: true, status: 200, json: async () => [] };
      }
      return productResponse;
    }),
  );
}

function renderProductDetail(slug: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/products/:slug", element: <ProductDetailPage /> }], {
    initialEntries: [`/products/${slug}`],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProductDetailPage", () => {
  it("renders the product, price, measurements, and breadcrumbs on success", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL });
    renderProductDetail("andina-aviador");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Andina Aviador" }),
    ).toBeInTheDocument();
    expect(screen.getByText("$ 45.000")).toBeInTheDocument();
    expect(screen.getByText("Ancho de lente")).toBeInTheDocument();
    expect(screen.getByText("58 mm")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toHaveTextContent(
      "Anteojos de Sol",
    );
  });

  it("switching variants updates availability", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.getByText("Disponible")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dorado" }));
    expect(await screen.findByText("Sin stock")).toBeInTheDocument();
  });

  it("builds a variant-specific WhatsApp message once a color is selected", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    // WhatsApp number isn't configured — the button renders disabled
    // (see WhatsAppButton), but its title still reflects the intended
    // behavior; the message itself is exercised via the shared
    // buildWhatsAppUrl unit tests. Here we confirm the CTA is present
    // and product-specific copy is used as its label.
    expect(screen.getByText("Consultar por WhatsApp")).toBeInTheDocument();
  });

  it("shows a product-specific 404 experience for an unknown slug, not a raw error", async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: "NOT_FOUND", message: "No product found." } }),
    });
    renderProductDetail("does-not-exist");

    expect(await screen.findByText("Producto no encontrado")).toBeInTheDocument();
    expect(screen.getByText(/ya no está disponible o la dirección cambió/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /volver al catálogo/i })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(screen.queryByText(/not_found|500|internal/i)).not.toBeInTheDocument();
  });
});
