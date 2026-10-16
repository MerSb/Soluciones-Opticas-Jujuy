import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { AccessoriesPage } from "../src/pages/AccessoriesPage";
import { ProductDetailPage } from "../src/pages/ProductDetailPage";
import { AdminNewProductPage } from "../src/pages/admin/AdminNewProductPage";
import { AdminProductDetailPage } from "../src/pages/admin/AdminProductDetailPage";
import { AdminVariantsEditor } from "../src/pages/admin/AdminVariantsEditor";
import { Header } from "../src/components/layout/Header";
import { ProductCard } from "../src/components/products/ProductCard";
import { ThemeProvider } from "../src/app/theme";

// ADR-0028. Fictional data only — never the client's real accessories.

type Handler = (url: URL, init?: RequestInit) => unknown;

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (raw: string | URL, init?: RequestInit) => {
    const url = new URL(raw);
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    if (url.pathname === "/api/auth/me" || url.pathname === "/api/auth/refresh") {
      return json(401, { error: { code: "UNAUTHENTICATED", message: "No autenticado." } });
    }
    const handler = routes[key];
    if (!handler) throw new Error(`Unhandled request: ${key}`);
    const result = handler(url, init);
    return result && typeof result === "object" && "ok" in result ? result : json(200, result);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path: string, routes: { path: string; element: ReactElement }[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const CLEANER_ITEM = {
  name: "Limpiador de prueba",
  slug: "limpiador-de-prueba",
  kind: "ACCESSORY",
  brand: { name: "Marca QA", slug: "marca-qa" },
  category: { name: "Accesorios", slug: "accesorios" },
  shape: null,
  styles: [],
  price: 3000,
  frameMeasurements: {
    lensWidth: null,
    bridgeWidth: null,
    templeLength: null,
    lensHeight: null,
    frameWidth: null,
  },
  colors: [],
  image: { publicId: "qa/limpiador", alt: "Limpiador de prueba", isPrimary: true },
  inStock: true,
};

const CLEANER_DETAIL = {
  name: "Limpiador de prueba",
  slug: "limpiador-de-prueba",
  kind: "ACCESSORY",
  accessoryRole: "CLEANER",
  brand: { name: "Marca QA", slug: "marca-qa" },
  category: { name: "Accesorios", slug: "accesorios" },
  shape: null,
  styles: [],
  price: 3000,
  frameMeasurements: CLEANER_ITEM.frameMeasurements,
  lensTypes: [],
  variants: [
    {
      id: "va",
      color: null,
      material: null,
      label: "Presentación A",
      sku: "QA-A",
      price: 3000,
      inStock: true,
      images: [{ publicId: "qa/a", alt: "Limpiador A", isPrimary: true }],
    },
    {
      id: "vb",
      color: null,
      material: null,
      label: "Presentación B",
      sku: "QA-B",
      price: 6000,
      inStock: false,
      images: [{ publicId: "qa/b", alt: "Limpiador B", isPrimary: true }],
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/accesorios", () => {
  it("lists accessories from the API (kind=ACCESSORY) with name, price and a link to their page", async () => {
    const fetchMock = stubApi({
      "GET /api/products": () => ({
        data: [
          CLEANER_ITEM,
          { ...CLEANER_ITEM, slug: "agotado", name: "Agotado QA", inStock: false },
        ],
        pagination: { page: 1, limit: 24, total: 2, totalPages: 1 },
      }),
    });
    renderAt("/accesorios", [{ path: "/accesorios", element: <AccessoriesPage /> }]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Accesorios" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Limpiador de prueba")).toBeInTheDocument();
    // Only the summary is announced, never the whole grid.
    const live = document.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0]).toHaveTextContent("2 accesorios");
    expect(
      screen.getByRole("link", { name: /Limpiador de prueba/ }).closest("[aria-live]"),
    ).toBeNull();
    expect(screen.getByText("Sin stock")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Limpiador de prueba/ })).toHaveAttribute(
      "href",
      "/accesorios/limpiador-de-prueba",
    );
    const listCall = fetchMock.mock.calls
      .map(([raw]) => new URL(raw as string))
      .find((url) => url.pathname === "/api/products")!;
    expect(listCall.searchParams.get("kind")).toBe("ACCESSORY");
    // The API sorts "price" by the base price, while an accessory card can
    // show a lower "Desde" price. /accesorios therefore offers no price sort
    // (newest first); adding one must sort by the displayed price instead.
    expect(listCall.searchParams.has("sort")).toBe(false);
    expect(screen.getByRole("link", { name: /Consultar por WhatsApp/ })).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/"),
    );
  });

  it("shows an empty state with WhatsApp when nothing is published yet", async () => {
    stubApi({
      "GET /api/products": () => ({
        data: [],
        pagination: { page: 1, limit: 24, total: 0, totalPages: 0 },
      }),
    });
    renderAt("/accesorios", [{ path: "/accesorios", element: <AccessoriesPage /> }]);

    expect(
      await screen.findByText("Todavía no hay accesorios publicados. Consultanos por WhatsApp."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Consultar por WhatsApp/ })).toBeInTheDocument();
  });

  it("the header links to Accesorios", async () => {
    stubApi({});
    renderAt("/", [{ path: "/", element: <Header /> }]);
    const links = await screen.findAllByRole("link", { name: "Accesorios" });
    expect(links[0]).toHaveAttribute("href", "/accesorios");
  });
});

describe("accessory product page", () => {
  it("selects by presentation, shows its price/availability, and skips every optical section", async () => {
    stubApi({ "GET /api/products/limpiador-de-prueba": () => CLEANER_DETAIL });
    renderAt("/products/limpiador-de-prueba", [
      { path: "/products/:slug", element: <ProductDetailPage /> },
    ]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Limpiador de prueba" }),
    ).toBeInTheDocument();
    const breadcrumbs = screen.getByRole("navigation", { name: /breadcrumb|migas|ruta/i });
    expect(within(breadcrumbs).getByRole("link", { name: "Accesorios" })).toHaveAttribute(
      "href",
      "/accesorios",
    );
    expect(screen.getByRole("group", { name: "Elegir presentación" })).toBeInTheDocument();
    expect(screen.getByText("Presentación:").nextSibling).toHaveTextContent("Presentación A");

    // A sold-out presentation says so on its own button.
    await userEvent.click(screen.getByRole("button", { name: "Presentación B (sin stock)" }));
    expect(screen.getByText("$ 6.000")).toBeInTheDocument();
    expect(screen.getByText("Sin stock")).toBeInTheDocument();

    expect(screen.queryByText(/medidas/i)).toBeNull();
    expect(screen.queryByText(/También puede interesarte/i)).toBeNull();
    const whatsapp = screen.getByRole("link", { name: /Consultar por WhatsApp/ });
    expect(decodeURIComponent(whatsapp.getAttribute("href")!)).toContain(
      "en el accesorio Limpiador de prueba de Marca QA, presentación Presentación B.",
    );
  });
});

const BRANDS = [{ id: "b1", name: "Marca QA", slug: "marca-qa", deletedAt: null }];
const CATEGORIES = [{ id: "c1", name: "Accesorios", slug: "accesorios", deletedAt: null }];

describe("admin — new product", () => {
  function routesWithCreate(onCreate: (body: unknown) => void) {
    return {
      "GET /api/admin/brands": () => BRANDS,
      "GET /api/admin/categories": () => CATEGORIES,
      "POST /api/admin/products": (_url: URL, init?: RequestInit) => {
        onCreate(JSON.parse(init!.body as string));
        return json(201, { id: "new-id" });
      },
    };
  }

  it("creates a frame by default, exactly as before", async () => {
    const onCreate = vi.fn();
    stubApi(routesWithCreate(onCreate));
    renderAt("/admin/products/new", [
      { path: "/admin/products/new", element: <AdminNewProductPage /> },
      { path: "/admin/products/:id", element: <p>Detalle</p> },
    ]);

    expect(await screen.findByRole("radio", { name: "Anteojo" })).toBeChecked();
    expect(screen.getByLabelText("Forma (opcional)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tipo de accesorio")).toBeNull();
  });

  it("creates an accessory: type required, no optical fields, individual sale on by default", async () => {
    const onCreate = vi.fn();
    stubApi(routesWithCreate(onCreate));
    renderAt("/admin/products/new?tipo=accesorio", [
      { path: "/admin/products/new", element: <AdminNewProductPage /> },
      { path: "/admin/products/:id", element: <p>Detalle creado</p> },
    ]);

    expect(await screen.findByRole("radio", { name: "Accesorio" })).toBeChecked();
    expect(screen.getByRole("heading", { name: "Nuevo accesorio" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Forma (opcional)")).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Se vende por separado/ })).toBeChecked();

    await userEvent.type(screen.getByLabelText("Nombre"), "Estuche QA");
    await screen.findByRole("option", { name: "Marca QA" });
    await userEvent.selectOptions(screen.getByLabelText("Marca"), "b1");
    await screen.findByRole("option", { name: "Accesorios" });
    await userEvent.selectOptions(screen.getByLabelText("Categoría"), "c1");
    await userEvent.type(screen.getByLabelText("Precio (ARS)"), "3000");
    const submit = screen.getByRole("button", { name: "Crear accesorio" });
    expect(submit).toBeDisabled(); // type still missing

    await userEvent.selectOptions(screen.getByLabelText("Tipo de accesorio"), "CASE");
    await userEvent.click(submit);

    expect(await screen.findByText("Detalle creado")).toBeInTheDocument();
    expect(onCreate).toHaveBeenCalledWith({
      name: "Estuche QA",
      brandId: "b1",
      categoryId: "c1",
      kind: "ACCESSORY",
      accessoryRole: "CASE",
      soldIndividually: true,
      basePrice: 3000,
    });
  });
});

function adminAccessory(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Cordón QA",
    slug: "cordon-qa",
    brand: { id: "b1", name: "Marca QA", slug: "marca-qa" },
    category: { id: "c1", name: "Accesorios", slug: "accesorios" },
    kind: "ACCESSORY",
    accessoryRole: "CORD",
    soldIndividually: true,
    shape: null,
    styles: [],
    basePrice: 2500,
    frameMeasurements: CLEANER_ITEM.frameMeasurements,
    variants: [],
    isComplete: false,
    lensTypes: [],
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("admin — accessory detail", () => {
  it("edits type and individual sale without frame fields, and hides measurements, styles and lenses", async () => {
    const onPatch = vi.fn();
    stubApi({
      "GET /api/admin/products/p1": () => adminAccessory(),
      "GET /api/admin/brands": () => BRANDS,
      "GET /api/admin/categories": () => CATEGORIES,
      "PATCH /api/admin/products/p1": (_url, init) => {
        const body = JSON.parse(init!.body as string);
        onPatch(body);
        return adminAccessory(body);
      },
    });
    renderAt("/admin/products/p1", [
      { path: "/admin/products/:id", element: <AdminProductDetailPage /> },
    ]);

    expect(await screen.findByText("Accesorio · Cordón")).toBeInTheDocument();
    expect(screen.queryByText(/Medidas del armazón/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Estilos" })).toBeNull();
    expect(screen.queryByText(/Cristales compatibles/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Colores y presentaciones" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Tipo de accesorio"), "CUSTOM_CORD");
    await userEvent.click(screen.getByRole("checkbox", { name: /Se vende por separado/ }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => expect(onPatch).toHaveBeenCalled());
    const body = onPatch.mock.calls[0]![0];
    expect(body).toMatchObject({
      accessoryRole: "CUSTOM_CORD",
      soldIndividually: false,
      basePrice: 2500,
    });
    for (const field of ["shape", "styles", "lensWidth", "frameWidth"]) {
      expect(body).not.toHaveProperty(field);
    }
  });
});

describe("admin — accessory variants", () => {
  const variant = {
    id: "v1",
    productId: "p1",
    color: null,
    material: null,
    label: "Presentación A",
    sku: "QA-A",
    stock: 0,
    priceOverride: null,
    images: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("adds a presentation with its own price, and edits presentation, price and stock in one save", async () => {
    const onCreate = vi.fn();
    const onUpdate = vi.fn();
    stubApi({
      "POST /api/admin/products/p1/variants": (_url, init) => {
        onCreate(JSON.parse(init!.body as string));
        return json(201, { ...variant, id: "v2" });
      },
      "PATCH /api/admin/products/p1/variants/v1": (_url, init) => {
        const body = JSON.parse(init!.body as string);
        onUpdate(body);
        return { ...variant, ...body };
      },
    });
    renderAt("/", [
      {
        path: "/",
        element: <AdminVariantsEditor productId="p1" variants={[variant]} kind="ACCESSORY" />,
      },
    ]);

    expect(screen.getByText("Agotado")).toBeInTheDocument();
    const card = screen.getByText("SKU: QA-A").closest("div.rounded-md") as HTMLElement;
    const save = within(card).getByRole("button", { name: "Guardar" });
    expect(save).toBeDisabled();
    await userEvent.clear(within(card).getByLabelText("Precio propio"));
    await userEvent.type(within(card).getByLabelText("Precio propio"), "6000");
    await userEvent.clear(within(card).getByLabelText("Stock"));
    await userEvent.type(within(card).getByLabelText("Stock"), "7");
    await userEvent.click(save);
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        label: "Presentación A",
        priceOverride: 6000,
        stock: 7,
      }),
    );

    await userEvent.type(screen.getByLabelText("Presentación (opcional)"), "Presentación C");
    await userEvent.type(screen.getByLabelText("Precio propio (opcional)"), "10000");
    await userEvent.type(screen.getByLabelText("SKU"), "QA-C");
    await userEvent.click(screen.getByRole("button", { name: "Agregar presentación" }));
    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        color: null,
        material: null,
        sku: "QA-C",
        stock: 0,
        label: "Presentación C",
        priceOverride: 10000,
      }),
    );
  });

  it("a frame keeps the original variant form (no presentation or price fields)", () => {
    stubApi({});
    renderAt("/", [{ path: "/", element: <AdminVariantsEditor productId="p1" variants={[]} /> }]);
    expect(screen.getByRole("heading", { name: "Variantes" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Presentación (opcional)")).toBeNull();
    expect(screen.getByRole("button", { name: "Agregar variante" })).toBeInTheDocument();
  });
});

describe("predeploy fixes (web)", () => {
  it("a card says 'Desde' only when the presentations have different prices", () => {
    stubApi({});
    renderAt("/", [
      {
        path: "/",
        element: (
          <>
            <ProductCard product={{ ...CLEANER_ITEM, price: 6000, priceFrom: true } as never} />
            <ProductCard
              product={{ ...CLEANER_ITEM, slug: "otro", name: "Otro", priceFrom: false } as never}
            />
          </>
        ),
      },
    ]);
    const links = screen.getAllByRole("link", { name: /Limpiador de prueba|Otro/ });
    expect(links[0]).toHaveTextContent("Desde $ 6.000");
    expect(links[1]).toHaveTextContent("$ 3.000");
    expect(links[1]).not.toHaveTextContent("Desde");
  });

  const frameVariant = {
    id: "fv",
    productId: "p1",
    color: "Negro",
    material: "Metal",
    label: null,
    sku: "QA-F",
    stock: 4,
    priceOverride: null,
    images: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("frame stock: an empty field can't be saved as 0, but 0 typed on purpose can", async () => {
    const onUpdate = vi.fn();
    stubApi({
      "PATCH /api/admin/products/p1/variants/fv": (_url, init) => {
        const body = JSON.parse(init!.body as string);
        onUpdate(body);
        return { ...frameVariant, ...body };
      },
    });
    renderAt("/", [
      { path: "/", element: <AdminVariantsEditor productId="p1" variants={[frameVariant]} /> },
    ]);
    const input = screen.getByLabelText("Stock de QA-F");
    const save = screen.getByRole("button", { name: "Guardar stock" });

    await userEvent.clear(input);
    expect(save).toBeDisabled();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Ingresá el stock (0 si no hay unidades).");

    await userEvent.type(input, "0");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ stock: 0 }));
  });

  it("accessory stock and the new-variant form refuse an empty stock", async () => {
    stubApi({});
    renderAt("/", [
      {
        path: "/",
        element: (
          <AdminVariantsEditor
            productId="p1"
            variants={[{ ...frameVariant, label: "Presentación A", color: null, material: null }]}
            kind="ACCESSORY"
          />
        ),
      },
    ]);
    const card = screen.getByText("SKU: QA-F").closest("div.rounded-md") as HTMLElement;
    await userEvent.clear(within(card).getByLabelText("Stock"));
    expect(within(card).getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(within(card).getByLabelText("Stock")).toHaveAccessibleDescription(
      "Ingresá el stock (0 si no hay unidades).",
    );

    const createStock = screen.getAllByLabelText("Stock").at(-1)!;
    await userEvent.type(screen.getByLabelText("SKU"), "QA-NEW");
    await userEvent.clear(createStock);
    expect(screen.getByRole("button", { name: "Agregar presentación" })).toBeDisabled();
    await userEvent.type(createStock, "0");
    expect(screen.getByRole("button", { name: "Agregar presentación" })).toBeEnabled();
  });
});

describe("admin — included accessory hints (Phase 2)", () => {
  it("explains how each type is used, with the surcharge from the API", async () => {
    stubApi({
      "GET /api/admin/products/p1": () => adminAccessory({ accessoryRole: "CUSTOM_CORD" }),
      "GET /api/admin/brands": () => BRANDS,
      "GET /api/admin/categories": () => CATEGORIES,
      "GET /api/accessories/included": () => ({
        case: { configured: false, options: [] },
        cord: { configured: false, options: [] },
        customCord: { configured: false, options: [], surcharge: 4000 },
      }),
    });
    renderAt("/admin/products/p1", [
      { path: "/admin/products/:id", element: <AdminProductDetailPage /> },
    ]);
    expect(
      await screen.findByText(
        /^Sus colores con stock se ofrecen como cordón personalizado \(\+\$\s4\.000\), que reemplaza al cordón estándar\.$/,
      ),
    ).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Tipo de accesorio"), "CASE");
    expect(
      screen.getByText(
        "Sus colores con stock se ofrecen como estuche incluido, sin costo, en todos los anteojos.",
      ),
    ).toBeInTheDocument();
  });
});
