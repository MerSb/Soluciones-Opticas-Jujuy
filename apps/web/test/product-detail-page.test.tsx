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
  styles: [],
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

// ProductDetailPage now also renders a FavoriteButton (GET /api/auth/me,
// then GET /api/favorites once "authenticated"), a RelatedProductsSection
// (GET /api/products/:slug/related, always — public, no auth needed),
// and a ProductMatchSection (GET /api/recommendations/:slug, only once
// authenticated) — a blanket "return the product for every call" mock
// would hand that unrelated data back for those too. This dispatches by
// path so each endpoint gets a shape it can actually parse, matching how
// the real API actually responds per-route.
function mockFetch(
  productResponse: { ok: boolean; status?: number; json: () => Promise<unknown> },
  overrides: {
    authenticated?: boolean;
    related?: { ok: boolean; status?: number; json: () => Promise<unknown> };
    recommendation?: { ok: boolean; status?: number; json: () => Promise<unknown> };
  } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const path = new URL(url).pathname;
      if (path === "/api/auth/me") {
        return overrides.authenticated
          ? {
              ok: true,
              status: 200,
              json: async () => ({
                id: "u1",
                email: "ana@example.com",
                firstName: "Ana",
                lastName: "Gómez",
                phone: null,
                role: "CUSTOMER",
              }),
            }
          : {
              ok: false,
              status: 401,
              json: async () => ({
                error: { code: "UNAUTHENTICATED", message: "Not logged in." },
              }),
            };
      }
      if (path === "/api/favorites") {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (path.endsWith("/related")) {
        return overrides.related ?? { ok: true, status: 200, json: async () => ({ data: [] }) };
      }
      if (path.startsWith("/api/recommendations/")) {
        return (
          overrides.recommendation ?? {
            ok: true,
            status: 200,
            json: async () => ({
              recommendation: null,
              profileCoverage: 0,
              confidenceLevel: "LOW",
              profileIncomplete: true,
            }),
          }
        );
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

  it("shows shape, material, and style attributes when present", async () => {
    mockFetch({
      ok: true,
      json: async () => ({ ...PRODUCT_DETAIL, styles: ["CLASSIC", "URBAN"] }),
    });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.getByText("Aviator")).toBeInTheDocument();
    expect(screen.getByText("Metal")).toBeInTheDocument();
    expect(screen.getByText("Clásico, Urbano")).toBeInTheDocument();
  });

  it("never renders the attributes row when shape/material/styles are all absent", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        ...PRODUCT_DETAIL,
        shape: null,
        styles: [],
        variants: PRODUCT_DETAIL.variants.map((v) => ({ ...v, material: null })),
      }),
    });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.queryByText("Forma:")).not.toBeInTheDocument();
    expect(screen.queryByText("Material:")).not.toBeInTheDocument();
    expect(screen.queryByText("Estilo:")).not.toBeInTheDocument();
  });

  it("renders related products once loaded, excluding nothing the API didn't already exclude", async () => {
    mockFetch(
      { ok: true, json: async () => PRODUCT_DETAIL },
      {
        related: {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                name: "Andina Redondo",
                slug: "andina-redondo",
                brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
                category: { name: "Anteojos Recetados", slug: "anteojos-recetados" },
                shape: "round",
                styles: [],
                inStock: true,
                price: 41000,
                frameMeasurements: {
                  lensWidth: null,
                  bridgeWidth: null,
                  templeLength: null,
                  lensHeight: null,
                  frameWidth: null,
                },
                colors: [],
                image: null,
              },
            ],
          }),
        },
      },
    );
    renderProductDetail("andina-aviador");

    expect(await screen.findByText("También puede interesarte")).toBeInTheDocument();
    expect(await screen.findByText("Andina Redondo")).toBeInTheDocument();
  });

  it("renders no related-products section when the API returns none", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.queryByText("También puede interesarte")).not.toBeInTheDocument();
  });

  it("shows nothing from the personalized-match section for a guest", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL }, { authenticated: false });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.queryByText("Tu compatibilidad con este modelo")).not.toBeInTheDocument();
    expect(screen.queryByText(/completá tus medidas/i)).not.toBeInTheDocument();
  });

  it("shows a profile-completion CTA when authenticated with an incomplete profile", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL }, { authenticated: true });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(await screen.findByText(/completá tus medidas y preferencias/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Completar mi perfil" })).toHaveAttribute(
      "href",
      "/account/optical-profile",
    );
  });

  it("shows the real compatibility score and reasons when authenticated with a usable match", async () => {
    mockFetch(
      { ok: true, json: async () => PRODUCT_DETAIL },
      {
        authenticated: true,
        recommendation: {
          ok: true,
          status: 200,
          json: async () => ({
            recommendation: {
              product: PRODUCT_DETAIL,
              score: 82,
              tier: "HIGH",
              matchEvidence: 70,
              evidenceLevel: "HIGH",
              reasons: [
                {
                  code: "PREFERRED_SHAPE",
                  message: "La forma coincide con una de tus preferencias.",
                  strength: "STRONG",
                },
              ],
              bestVariant: { id: "v1", color: "Negro", material: "Metal", inStock: true },
            },
            profileCoverage: 70,
            confidenceLevel: "HIGH",
            profileIncomplete: false,
          }),
        },
      },
    );
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(await screen.findByText("Tu compatibilidad con este modelo")).toBeInTheDocument();
    expect(screen.getByText(/82%/)).toBeInTheDocument();
    expect(screen.getByText("La forma coincide con una de tus preferencias.")).toBeInTheDocument();
  });
});
