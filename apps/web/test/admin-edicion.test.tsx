import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminVariantDto } from "@soluciones-opticas/shared";
import { AdminProductDetailPage } from "../src/pages/admin/AdminProductDetailPage";

// Correcting a product or variant in place: only what changed is sent;
// id, SKU, stock, tones and photos are never part of a correction.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const VARIANT: AdminVariantDto = {
  id: "v1",
  productId: "p1",
  color: "Negro",
  material: "Metal",
  label: null,
  colorTones: ["NEGRO"],
  sku: "AND-NEG",
  stock: 5,
  priceOverride: null,
  images: [
    {
      id: "img1",
      variantId: "v1",
      cloudinaryPublicId: "soluciones-opticas/staging/products/p1/v1/x",
      alt: "Foto",
      sortOrder: 0,
      isPrimary: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function product(kind: "FRAME" | "ACCESSORY" = "FRAME") {
  return {
    id: "p1",
    name: "Andina Aviador",
    slug: "andina-aviador",
    brand: { id: "b1", name: "Andina", slug: "andina" },
    category: { id: "c1", name: "Sol", slug: "sol" },
    kind,
    accessoryRole: kind === "ACCESSORY" ? "CASE" : null,
    soldIndividually: true,
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
    variants: [VARIANT],
    isComplete: true,
    lensTypes: [],
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

type Reply = "ok" | "conflict" | "network";

// Records every write; `hold` keeps the variant PATCH waiting.
function stubApi(kind: "FRAME" | "ACCESSORY" = "FRAME", reply: Reply = "ok", hold?: Promise<void>) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (method === "GET") {
        if (path === "/api/admin/products/p1") return ok(product(kind));
        if (path === "/api/admin/brands")
          return ok([{ id: "b1", name: "Andina", slug: "andina", deletedAt: null }]);
        if (path === "/api/admin/categories") {
          return ok([
            { id: "c1", name: "Sol", slug: "sol", deletedAt: null },
            { id: "c2", name: "Recetados", slug: "recetados", deletedAt: null },
          ]);
        }
        return ok([]);
      }
      const body = JSON.parse(String(init!.body));
      writes.push({ method, path, body });
      if (path.includes("/variants/")) {
        await hold;
        if (reply === "network") throw new TypeError("Failed to fetch");
        if (reply === "conflict") {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: {
                code: "CONFLICT",
                message: "El color «Rojo» ya está cargado en este accesorio.",
              },
            }),
          };
        }
        return ok({ ...VARIANT, ...body });
      }
      return ok({ ...product(kind), ...body });
    }),
  );
  return writes;
}

function renderPage() {
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

async function openVariantEditor() {
  await userEvent.click(await screen.findByRole("button", { name: "Corregir datos de Negro" }));
  return screen.getByRole("form", { name: "Corregir datos de Negro" });
}

describe("frame variant — correcting its data", () => {
  it("shows the current values", async () => {
    stubApi();
    renderPage();
    expect(
      await screen.findByText(
        /Color: Negro · Material: Metal · Precio: \$\s?45\.000 \(del producto\)/,
      ),
    ).toBeInTheDocument();
  });

  it("a material change sends only the material: SKU, stock, price and photos untouched", async () => {
    const writes = stubApi();
    renderPage();
    const form = await openVariantEditor();
    const material = within(form).getByLabelText("Material");
    await userEvent.clear(material);
    await userEvent.type(material, "Acetato");
    await userEvent.click(within(form).getByRole("button", { name: "Guardar datos" }));
    await waitFor(() =>
      expect(writes).toEqual([
        {
          method: "PATCH",
          path: "/api/admin/products/p1/variants/v1",
          body: { material: "Acetato" },
        },
      ]),
    );
    expect(await screen.findByText("Datos de «Negro» guardados.")).toBeInTheDocument();
  });

  it("a price change is confirmed and never sends the stock", async () => {
    const writes = stubApi();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    const form = await openVariantEditor();
    await userEvent.type(within(form).getByLabelText("Precio propio (opcional)"), "52000");
    await userEvent.click(within(form).getByRole("button", { name: "Guardar datos" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(confirm.mock.calls[0]![0]).toMatch(
      /pasa de \$\s?45\.000 a \$\s?52\.000[\s\S]*stock, el SKU y las fotos no cambian/,
    );
    expect(writes[0]!.body).toEqual({ priceOverride: 52000 });
  });

  it("declining the price confirmation sends nothing and keeps what was typed", async () => {
    const writes = stubApi();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    const form = await openVariantEditor();
    await userEvent.type(within(form).getByLabelText("Precio propio (opcional)"), "52000");
    await userEvent.click(within(form).getByRole("button", { name: "Guardar datos" }));
    expect(writes).toEqual([]);
    expect(within(form).getByLabelText("Precio propio (opcional)")).toHaveValue(52000);
  });

  it("refuses a zero price before sending", async () => {
    const writes = stubApi();
    renderPage();
    const form = await openVariantEditor();
    await userEvent.type(within(form).getByLabelText("Precio propio (opcional)"), "0");
    expect(within(form).getByText(/Ingresá un precio mayor a 0/)).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Guardar datos" })).toBeDisabled();
    expect(writes).toEqual([]);
  });

  it.each([
    ["network", /Revisá la conexión/],
    ["conflict", /ya está cargado/],
  ] as const)("a %s error keeps the typed data", async (reply, message) => {
    stubApi("FRAME", reply);
    renderPage();
    const form = await openVariantEditor();
    const color = within(form).getByLabelText("Nombre del color");
    await userEvent.clear(color);
    await userEvent.type(color, "Negro mate");
    await userEvent.click(within(form).getByRole("button", { name: "Guardar datos" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(message);
    expect(color).toHaveValue("Negro mate");
  });

  it("cancel sends nothing and restores the current values", async () => {
    const writes = stubApi();
    renderPage();
    let form = await openVariantEditor();
    await userEvent.clear(within(form).getByLabelText("Material"));
    await userEvent.click(within(form).getByRole("button", { name: "Cancelar" }));
    expect(writes).toEqual([]);
    form = await openVariantEditor();
    expect(within(form).getByLabelText("Material")).toHaveValue("Metal");
  });

  it("sends a correction once, however many times it is submitted", async () => {
    let release!: () => void;
    const writes = stubApi("FRAME", "ok", new Promise<void>((resolve) => (release = resolve)));
    renderPage();
    const form = await openVariantEditor();
    await userEvent.type(within(form).getByLabelText("Material"), " liviano");
    const save = within(form).getByRole("button", { name: "Guardar datos" });
    await userEvent.click(save);
    await userEvent.click(save);
    release();
    await waitFor(() => expect(writes).toHaveLength(1));
  });
});

describe("accessory variant — correcting its data", () => {
  it("edits color and material; its price stays in its own card", async () => {
    const writes = stubApi("ACCESSORY");
    renderPage();
    const form = await openVariantEditor();
    expect(within(form).queryByLabelText("Precio propio (opcional)")).toBeNull();
    const color = within(form).getByLabelText("Nombre del color");
    await userEvent.clear(color);
    await userEvent.type(color, "Negro azabache");
    await userEvent.click(within(form).getByRole("button", { name: "Guardar datos" }));
    await waitFor(() => expect(writes[0]?.body).toEqual({ color: "Negro azabache" }));
  });
});

describe("product — important changes are confirmed", () => {
  it("confirms a base price and category change, then saves", async () => {
    const writes = stubApi();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    const price = await screen.findByLabelText("Precio base (ARS)");
    await userEvent.clear(price);
    await userEvent.type(price, "48000");
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(confirm.mock.calls[0]![0]).toMatch(
      /Precio base: \$\s?45\.000 → \$\s?48\.000[\s\S]*Categoría: Sol → Recetados/,
    );
    expect(writes[0]!.body).toMatchObject({ basePrice: 48000, categoryId: "c2" });
    expect(await screen.findByText("Los cambios se guardaron correctamente.")).toBeInTheDocument();
  });

  it("declining sends nothing and keeps the typed price", async () => {
    const writes = stubApi();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    const price = await screen.findByLabelText("Precio base (ARS)");
    await userEvent.clear(price);
    await userEvent.type(price, "48000");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(writes).toEqual([]);
    expect(price).toHaveValue(48000);
  });

  it("a name or shape correction saves without asking", async () => {
    const writes = stubApi();
    const confirm = vi.spyOn(window, "confirm");
    renderPage();
    const name = await screen.findByLabelText("Nombre");
    await userEvent.clear(name);
    await userEvent.type(name, "Andina Aviador Clásico");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(confirm).not.toHaveBeenCalled();
    expect(writes[0]!.body).toMatchObject({ name: "Andina Aviador Clásico", basePrice: 45000 });
  });
});
