import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductDetailPage } from "../src/pages/ProductDetailPage";
import { parseStoredCart } from "../src/lib/cart/cart";
import { CART_STORAGE_KEY } from "../src/lib/cart/cart-store";
import { resetBrowserState, stubApi } from "./order-fixtures";

// Payments V1 — Phase C: "Agregar al carrito" on the product page reuses
// the configurator's selection and backend quote. WhatsApp stays.

const HD = "22222222-2222-4222-8222-222222222222";
const SPECTRUM = "44444444-4444-4444-8444-444444444444";
const GRIS = "55555555-5555-4555-8555-555555555555";

const PRODUCT = {
  name: "Test Frame",
  slug: "test-frame",
  brand: { name: "Test Brand", slug: "test-brand" },
  category: { name: "Anteojos Recetados", slug: "anteojos-recetados" },
  shape: null,
  styles: [],
  price: 1000,
  frameMeasurements: {
    lensWidth: null,
    bridgeWidth: null,
    templeLength: null,
    lensHeight: null,
    frameWidth: null,
  },
  variants: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      color: "Negro",
      material: "Acetato",
      sku: "TEST-SKU-1",
      price: 1000,
      inStock: true,
      images: [{ publicId: "test/img", alt: "Test", isPrimary: true }],
    },
  ],
  lensTypes: [
    {
      id: HD,
      name: "Test HD",
      slug: "test-hd",
      description: null,
      price: 500,
      supportsCustomGraduation: true,
      isFeatured: false,
      treatments: [],
      options: [],
      available: true,
    },
    {
      id: SPECTRUM,
      name: "Test Spectrum",
      slug: "test-spectrum",
      description: null,
      price: 800,
      supportsCustomGraduation: false,
      isFeatured: false,
      treatments: [],
      options: [
        {
          id: GRIS,
          name: "Gris",
          slug: "gris",
          description: null,
          swatchHex: null,
          price: 800,
          available: true,
        },
      ],
      available: true,
    },
  ],
};

function quoteFor(url: URL) {
  const lensTypeId = url.searchParams.get("lensTypeId");
  const lens =
    lensTypeId === HD
      ? {
          lensTypeId: HD,
          lensTypeName: "Test HD",
          lensOptionId: null,
          lensOptionName: null,
          treatments: [],
        }
      : lensTypeId === SPECTRUM
        ? {
            lensTypeId: SPECTRUM,
            lensTypeName: "Test Spectrum",
            lensOptionId: GRIS,
            lensOptionName: "Gris",
            treatments: [],
          }
        : null;
  const mode = url.searchParams.get("graduationMode") ?? "NONE";
  const lensPrice = lens ? (lensTypeId === HD ? 500 : 800) : 0;
  return {
    status: 200,
    body: {
      product: { name: PRODUCT.name, slug: PRODUCT.slug },
      frame: {
        variantId: PRODUCT.variants[0]!.id,
        sku: "TEST-SKU-1",
        color: "Negro",
        material: "Acetato",
        inStock: true,
      },
      lens,
      graduation: { mode, requiresOpticalConsultation: mode === "CUSTOM" },
      framePrice: 1000,
      lensPrice,
      total: 1000 + lensPrice,
    },
  };
}

function renderPage(product: unknown = PRODUCT) {
  stubApi({
    "GET /api/products/test-frame": { status: 200, body: product },
    "GET /api/products/test-frame/quote": (_init, url) => quoteFor(url),
    "GET /api/products/test-frame/related": { status: 200, body: { data: [] } },
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/products/:slug", element: <ProductDetailPage /> }], {
    initialEntries: ["/products/test-frame"],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const storedCart = () => parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));

beforeEach(() => resetBrowserState());
afterEach(() => vi.unstubAllGlobals());

describe("ProductDetailPage — add to cart", () => {
  it("adds the frame only, keeps WhatsApp as a secondary action", async () => {
    const user = userEvent.setup();
    renderPage();
    const add = await screen.findByRole("button", { name: "Agregar al carrito" });
    await screen.findByText("Sin cristales", { selector: "dd" });
    expect(screen.getByText("Consultar por WhatsApp")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Cantidad"), "2");
    await user.click(add);

    expect(await screen.findByRole("status", { name: "" })).toHaveTextContent(
      "Agregado al carrito",
    );
    expect(storedCart()).toEqual([
      expect.objectContaining({
        productSlug: "test-frame",
        variantId: PRODUCT.variants[0]!.id,
        lensTypeId: null,
        lensOptionId: null,
        graduationMode: "NONE",
        quantity: 2,
        unitPrice: 1000,
      }),
    ]);
  });

  it("adds frame + lens with the quoted price and names", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("radio", { name: /Test Spectrum/ }));
    await user.click(screen.getByRole("radio", { name: /Gris/ }));
    await screen.findByText("Test Spectrum — Gris");
    await user.click(screen.getByRole("button", { name: "Agregar al carrito" }));

    expect(storedCart()[0]).toMatchObject({
      lensTypeId: SPECTRUM,
      lensTypeName: "Test Spectrum",
      lensOptionId: GRIS,
      lensOptionName: "Gris",
      graduationMode: "NONE",
      unitPrice: 1800,
    });
  });

  it("keeps CUSTOM graduation as a separate line, with no prescription fields", async () => {
    const user = userEvent.setup();
    renderPage();
    const add = await screen.findByRole("button", { name: "Agregar al carrito" });
    await user.click(await screen.findByRole("radio", { name: /Test HD/ }));
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);

    await user.click(screen.getByRole("radio", { name: "Quiero graduación personalizada" }));
    await screen.findByText("A coordinar con la óptica");
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);

    const lines = storedCart();
    expect(lines.map((line) => line.graduationMode)).toEqual(["NONE", "CUSTOM"]);
    expect(lines[1]).toMatchObject({ lensTypeId: HD, unitPrice: 1500 });
    for (const label of [/esfera/i, /cilindro/i, /eje/i, /receta/i]) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
  });

  it("does not add an incomplete lens configuration", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("radio", { name: /Test Spectrum/ }));
    const add = screen.getByRole("button", { name: "Agregar al carrito" });
    expect(add).toBeDisabled();
    expect(screen.getByText("Elegí una variedad de cristal para continuar.")).toBeInTheDocument();
    await user.click(add);
    expect(storedCart()).toEqual([]);
  });

  it("does not add a variant without stock", async () => {
    renderPage({
      ...PRODUCT,
      lensTypes: [],
      variants: [{ ...PRODUCT.variants[0]!, inStock: false }],
    });
    const add = await screen.findByRole("button", { name: "Agregar al carrito" });
    expect(add).toBeDisabled();
    expect(screen.getByText("Esta variante no tiene stock en este momento.")).toBeInTheDocument();
  });
});
