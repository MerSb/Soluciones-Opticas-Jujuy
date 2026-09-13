import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminProductDetailPage } from "../src/pages/admin/AdminProductDetailPage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const BRAND = { id: "b1", name: "Andina Eyewear", slug: "andina-eyewear", deletedAt: null };
const CATEGORY = { id: "c1", name: "Sol", slug: "sol", deletedAt: null };

function baseProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Andina Aviador",
    slug: "andina-aviador",
    brand: { id: "b1", name: "Andina Eyewear", slug: "andina-eyewear" },
    category: { id: "c1", name: "Sol", slug: "sol" },
    shape: null,
    styles: [],
    basePrice: 45000,
    frameMeasurements: {
      lensWidth: null,
      bridgeWidth: null,
      templeLength: null,
      lensHeight: null,
      frameWidth: null,
    },
    variants: [],
    isComplete: false,
    lensTypes: [],
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// Fictional test data — never the client's real lens names.
const LENS_TYPES = [
  { id: "lt1", name: "Cristal Uno", slug: "cristal-uno", deletedAt: null },
  { id: "lt2", name: "Cristal Dos", slug: "cristal-dos", deletedAt: null },
  {
    id: "lt3",
    name: "Cristal Retirado",
    slug: "cristal-retirado",
    deletedAt: "2026-01-02T00:00:00.000Z",
  },
];

function stubFetch(
  product: unknown,
  opts?: { onDelete?: () => void; onSetLensTypes?: (body: unknown) => void },
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/admin/products/p1" && method === "GET") {
        return { ok: true, status: 200, json: async () => product };
      }
      if (path === "/api/admin/products/p1" && method === "DELETE") {
        opts?.onDelete?.();
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...(product as object), deletedAt: "2026-02-01T00:00:00.000Z" }),
        };
      }
      if (path === "/api/admin/brands") {
        return { ok: true, status: 200, json: async () => [BRAND] };
      }
      if (path === "/api/admin/categories") {
        return { ok: true, status: 200, json: async () => [CATEGORY] };
      }
      if (path === "/api/admin/lens-types") {
        return { ok: true, status: 200, json: async () => LENS_TYPES };
      }
      if (path === "/api/admin/products/p1/lens-types" && method === "PUT") {
        const body = JSON.parse(init!.body as string);
        opts?.onSetLensTypes?.(body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...(product as object),
            lensTypes: LENS_TYPES.filter((type) => body.lensTypeIds.includes(type.id)),
          }),
        };
      }
      throw new Error(`Unhandled request: ${method} ${path}`);
    }),
  );
}

function renderDetailPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [{ path: "/admin/products/:id", element: <AdminProductDetailPage /> }],
    { initialEntries: ["/admin/products/p1"] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("AdminProductDetailPage — completeness", () => {
  it("shows no Incompleto badge and no help text for a complete product", async () => {
    stubFetch(
      baseProduct({
        isComplete: true,
        variants: [
          {
            id: "v1",
            productId: "p1",
            color: "Negro",
            material: "Metal",
            sku: "SKU-1",
            stock: 3,
            priceOverride: null,
            images: [
              {
                id: "img1",
                variantId: "v1",
                cloudinaryPublicId: "test/img1",
                alt: "Foto",
                sortOrder: 0,
                isPrimary: true,
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    renderDetailPage();
    await screen.findByText("Andina Aviador");
    expect(screen.queryByText("Incompleto")).not.toBeInTheDocument();
  });

  it("shows the specific help text when both variant and image are missing", async () => {
    stubFetch(baseProduct({ isComplete: false, variants: [] }));
    renderDetailPage();
    expect(await screen.findByText("Incompleto")).toBeInTheDocument();
    expect(
      screen.getByText("Agregá una variante y al menos una imagen para publicar el producto."),
    ).toBeInTheDocument();
  });

  it("shows the specific help text when only the image is missing", async () => {
    stubFetch(
      baseProduct({
        isComplete: false,
        variants: [
          {
            id: "v1",
            productId: "p1",
            color: "Negro",
            material: null,
            sku: "SKU-1",
            stock: 0,
            priceOverride: null,
            images: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    renderDetailPage();
    expect(await screen.findByText("Incompleto")).toBeInTheDocument();
    expect(
      screen.getByText("Agregá al menos una imagen para que el producto pueda mostrarse."),
    ).toBeInTheDocument();
  });

  it("price input never communicates that 0 is a valid price", async () => {
    stubFetch(baseProduct());
    renderDetailPage();
    await screen.findByText("Andina Aviador");
    expect(screen.getByLabelText("Precio base (ARS)")).toHaveAttribute("min", "0.01");
  });

  it("measurement labels state the unit explicitly", async () => {
    stubFetch(baseProduct());
    renderDetailPage();
    await screen.findByText("Andina Aviador");
    expect(screen.getByLabelText("Ancho del lente (mm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Ancho del puente (mm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Largo de patilla (mm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Altura del lente (mm)")).toBeInTheDocument();
    expect(screen.getByLabelText("Ancho del armazón (mm)")).toBeInTheDocument();
  });
});

describe("AdminProductDetailPage — destructive action confirmation", () => {
  it("cancelling the confirm dialog never calls the delete mutation", async () => {
    const onDelete = vi.fn();
    stubFetch(baseProduct(), { onDelete });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderDetailPage();

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar producto" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("confirming the dialog calls the delete mutation", async () => {
    const onDelete = vi.fn();
    stubFetch(baseProduct(), { onDelete });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetailPage();

    await userEvent.click(await screen.findByRole("button", { name: "Eliminar producto" }));
    expect(onDelete).toHaveBeenCalled();
  });
});

describe("AdminProductDetailPage — cristales compatibles (ADR-0023)", () => {
  it("shows the product's current lens types and saves the explicit full set", async () => {
    const onSetLensTypes = vi.fn();
    stubFetch(baseProduct({ isComplete: true, lensTypes: [LENS_TYPES[0]] }), { onSetLensTypes });
    renderDetailPage();

    expect(
      await screen.findByRole("heading", { name: "Cristales compatibles" }),
    ).toBeInTheDocument();
    const uno = await screen.findByRole("checkbox", { name: "Cristal Uno" });
    expect(uno).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Cristal Dos" })).not.toBeChecked();
    // A retired type that isn't attached is never offered.
    expect(screen.queryByText("Cristal Retirado")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Cristal Dos" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cristales compatibles" }));

    expect(onSetLensTypes).toHaveBeenCalledWith({ lensTypeIds: ["lt1", "lt2"] });
    expect(
      await screen.findByText("Los cristales compatibles se guardaron correctamente."),
    ).toBeInTheDocument();
  });

  it("a product without lens types can stay that way — none checked, no Incompleto badge from it", async () => {
    stubFetch(baseProduct({ isComplete: true }));
    renderDetailPage();

    await screen.findByRole("heading", { name: "Cristales compatibles" });
    expect(await screen.findByRole("checkbox", { name: "Cristal Uno" })).not.toBeChecked();
    expect(screen.queryByText("Incompleto")).not.toBeInTheDocument();
  });
});
