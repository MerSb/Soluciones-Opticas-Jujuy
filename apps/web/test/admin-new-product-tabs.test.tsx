import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminNewProductPage } from "../src/pages/admin/AdminNewProductPage";
import { ThemeProvider } from "../src/app/theme";
import { STORAGE_KEY } from "../src/lib/product-drafts";

// Multi-tab new-product page. Fictional data only; Cloudinary is never
// reached (its upload URL is answered by the stub).

const BRANDS = [{ id: "b1", name: "Marca QA", slug: "marca-qa", deletedAt: null }];
const CATEGORIES = [{ id: "c1", name: "Anteojos de Sol", slug: "sol", deletedAt: null }];

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function stubBackend(options: { failCloudinaryOnce?: boolean; failProductCreate?: boolean } = {}) {
  const calls: Call[] = [];
  let products = 0;
  let variants = 0;
  let uploads = 0;
  let cloudinaryFailures = options.failCloudinaryOnce ? 1 : 0;
  const fetchMock = vi.fn(async (raw: string | URL, init?: RequestInit) => {
    const url = new URL(raw);
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : init?.body ? "form-data" : null;
    calls.push({ method, path: url.pathname, body });
    if (url.pathname === "/api/auth/me" || url.pathname === "/api/auth/refresh") {
      return json(401, { error: { code: "UNAUTHENTICATED", message: "No autenticado." } });
    }
    if (url.hostname === "api.cloudinary.com") {
      if (cloudinaryFailures > 0) {
        cloudinaryFailures -= 1;
        throw new TypeError("Failed to fetch");
      }
      uploads += 1;
      return json(200, { public_id: `test/upload-${uploads}` });
    }
    if (method === "GET" && url.pathname === "/api/admin/brands") return json(200, BRANDS);
    if (method === "GET" && url.pathname === "/api/admin/categories") return json(200, CATEGORIES);
    if (method === "GET" && url.pathname === "/api/accessories/included") {
      return json(404, { error: { code: "NOT_FOUND", message: "No." } });
    }
    if (method === "POST" && url.pathname === "/api/admin/products") {
      if (options.failProductCreate) {
        return json(409, {
          error: { code: "CONFLICT", message: "Ya existe un producto con ese nombre." },
        });
      }
      products += 1;
      return json(201, { id: `p${products}` });
    }
    const variant = url.pathname.match(/^\/api\/admin\/products\/(p\d+)\/variants$/);
    if (method === "POST" && variant) {
      variants += 1;
      return json(201, { id: `${variant[1]}-v${variants}` });
    }
    if (method === "POST" && url.pathname.endsWith("/images/sign-upload")) {
      return json(200, {
        cloudName: "demo",
        apiKey: "test",
        timestamp: 1,
        signature: "sig",
        publicId: "test/x",
        allowedFormats: "jpg,png,webp",
      });
    }
    if (method === "POST" && url.pathname.endsWith("/images")) {
      return json(201, { id: `img-${calls.length}` });
    }
    throw new Error(`Unhandled request: ${method} ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/admin/products/new", element: <AdminNewProductPage /> },
      { path: "/admin/products/:id", element: <p>Ficha del producto</p> },
    ],
    { initialEntries: ["/admin/products/new"] },
  );
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const photo = (name: string) => new File(["fake-bytes"], name, { type: "image/jpeg" });
const panel = () => screen.getByRole("tabpanel");

async function fillProduct(
  user: ReturnType<typeof userEvent.setup>,
  data: { name: string; price: string; color?: string; sku?: string; photos?: File[] },
) {
  const p = within(panel());
  await user.type(p.getByLabelText("Nombre"), data.name);
  await p.findByRole("option", { name: "Marca QA" });
  await user.selectOptions(p.getByLabelText("Marca"), "b1");
  await user.selectOptions(p.getByLabelText("Categoría"), "c1");
  await user.type(p.getByLabelText("Precio base (ARS)"), data.price);
  if (data.color) await user.type(p.getByLabelText("Color"), data.color);
  if (data.sku) await user.type(p.getByLabelText("SKU"), data.sku);
  if (data.photos) await user.upload(p.getByLabelText("Fotos (JPEG, PNG o WebP)"), data.photos);
}

beforeEach(() => {
  window.localStorage.clear();
  let n = 0;
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => `blob:preview-${(n += 1)}`,
      revokeObjectURL: () => {},
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AdminNewProductPage — several products at once", () => {
  it("keeps every tab's fields and photos while switching, and labels tabs by name", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderPage();

    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      color: "Negro",
      sku: "UNO-1",
      photos: [photo("uno.jpg")],
    });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await fillProduct(user, {
      name: "Dos QA",
      price: "2000",
      color: "Rojo",
      sku: "DOS-1",
      photos: [photo("dos-a.jpg"), photo("dos-b.jpg")],
    });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await fillProduct(user, { name: "Tres QA", price: "3000" });

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Uno QA●", "Dos QA●", "Tres QA●"]);
    expect(within(tabs[0]!).getByLabelText("con cambios sin guardar")).toBeInTheDocument();

    await user.click(tabs[0]!);
    expect(within(panel()).getByLabelText("Nombre")).toHaveValue("Uno QA");
    expect(within(panel()).getByLabelText("SKU")).toHaveValue("UNO-1");
    expect(within(panel()).getByText("uno.jpg")).toBeInTheDocument();
    expect(within(panel()).queryByText("dos-a.jpg")).toBeNull();

    await user.click(tabs[1]!);
    expect(within(panel()).getByLabelText("Precio base (ARS)")).toHaveValue(2000);
    expect(
      within(panel())
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining("dos-a.jpg"), expect.stringContaining("dos-b.jpg")]);
  });

  it("saves the second product first: its color and photos go to its own product, the others stay", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      color: "Negro",
      sku: "UNO-1",
      photos: [photo("uno.jpg")],
    });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await fillProduct(user, {
      name: "Dos QA",
      price: "2000",
      color: "Rojo",
      sku: "DOS-1",
      photos: [photo("dos-a.jpg"), photo("dos-b.jpg")],
    });

    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    expect(await within(panel()).findByText("✓ «Dos QA» guardado.")).toBeInTheDocument();

    const writes = calls.filter((call) => call.method === "POST" && !call.path.startsWith("/v1_1"));
    expect(writes.map((call) => call.path)).toEqual([
      "/api/admin/products",
      "/api/admin/products/p1/variants",
      "/api/admin/products/p1/variants/p1-v1/images/sign-upload",
      "/api/admin/products/p1/variants/p1-v1/images",
      "/api/admin/products/p1/variants/p1-v1/images/sign-upload",
      "/api/admin/products/p1/variants/p1-v1/images",
    ]);
    expect(writes[0]!.body).toMatchObject({ name: "Dos QA", basePrice: 2000 });
    expect(writes[1]!.body).toEqual({ color: "Rojo", sku: "DOS-1", stock: 0 });
    expect(writes[3]!.body).toMatchObject({ cloudinaryPublicId: "test/upload-1", isPrimary: true });
    expect(writes[5]!.body).toMatchObject({
      cloudinaryPublicId: "test/upload-2",
      isPrimary: false,
    });

    // Saving one product does not touch the other draft.
    const [first, second] = screen.getAllByRole("tab");
    expect(second!.textContent).toBe("Dos QA✓");
    await user.click(first!);
    expect(within(panel()).getByLabelText("Nombre")).toHaveValue("Uno QA");
    expect(within(panel()).getByText("uno.jpg")).toBeInTheDocument();
    expect(screen.queryByText("Ficha del producto")).toBeNull(); // several tabs: no redirect
  });

  it("a double click creates the product once", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillProduct(user, { name: "Uno QA", price: "1000" });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await fillProduct(user, { name: "Dos QA", price: "2000" });
    await user.dblClick(within(panel()).getByRole("button", { name: "Crear producto" }));
    await within(panel()).findByText("✓ «Dos QA» guardado.");
    expect(
      calls.filter((call) => call.method === "POST" && call.path === "/api/admin/products"),
    ).toHaveLength(1);
  });

  it("validates: photos need a color with SKU; an API error is shown and nothing else is sent", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ failProductCreate: true });
    renderPage();
    await fillProduct(user, { name: "Uno QA", price: "1000", photos: [photo("uno.jpg")] });
    const submit = within(panel()).getByRole("button", { name: "Crear producto" });
    expect(submit).toBeDisabled();
    expect(within(panel()).getByText(/Falta el SKU del color/)).toBeInTheDocument();

    await user.type(within(panel()).getByLabelText("SKU"), "UNO-1");
    await user.click(submit);
    expect(await within(panel()).findByRole("alert")).toHaveTextContent(
      "Ya existe un producto con ese nombre.",
    );
    expect(calls.some((call) => call.path.includes("/variants"))).toBe(false);
    expect(within(panel()).getByLabelText("Nombre")).toHaveValue("Uno QA");
  });

  it("a network error while uploading a photo: the retry continues, never creating the product again", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ failCloudinaryOnce: true });
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      color: "Negro",
      sku: "UNO-1",
      photos: [photo("uno.jpg")],
    });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await fillProduct(user, { name: "Dos QA", price: "2000" });
    await user.click(screen.getAllByRole("tab")[0]!);
    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    expect(await within(panel()).findByRole("alert")).toHaveTextContent(
      "El producto y su color se crearon, pero falló la foto 1: No pudimos conectarnos",
    );
    await user.click(within(panel()).getByRole("button", { name: "Reintentar lo pendiente" }));
    await within(panel()).findByText("✓ «Uno QA» guardado.");
    expect(
      calls.filter((call) => call.method === "POST" && call.path === "/api/admin/products"),
    ).toHaveLength(1);
    expect(
      calls.filter((call) => call.method === "POST" && call.path.endsWith("/variants")),
    ).toHaveLength(1);
    expect(
      calls.filter((call) => call.method === "POST" && call.path.endsWith("/images")),
    ).toHaveLength(1);
  });

  it("asks before closing a tab with unsaved changes", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderPage();
    await fillProduct(user, { name: "Uno QA", price: "1000" });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Cerrar Uno QA" }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("«Uno QA» tiene cambios sin guardar"),
    );
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Cerrar Uno QA" }));
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    // An untouched tab closes without asking.
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await user.click(screen.getByRole("button", { name: "Cerrar Producto 2" }));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("recovers typed drafts after a reload, never the photo files", async () => {
    const user = userEvent.setup();
    stubBackend();
    const first = renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      color: "Negro",
      sku: "UNO-1",
      photos: [photo("uno.jpg")],
    });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await fillProduct(user, { name: "Dos QA", price: "2000" });
    const stored = window.localStorage.getItem(STORAGE_KEY)!;
    expect(stored).toContain("Uno QA");
    expect(stored).not.toContain("uno.jpg");
    expect(stored).not.toContain("blob:");
    first.unmount();

    renderPage();
    expect(await screen.findByText(/Recuperamos 2 borradores sin guardar/)).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Uno QA●", "Dos QA●"]);
    await user.click(tabs[0]!);
    expect(within(panel()).getByLabelText("SKU")).toHaveValue("UNO-1");
    expect(
      within(panel()).getByText(/Las fotos elegidas antes de recargar no se conservan/),
    ).toBeInTheDocument();
    expect(within(panel()).queryByText("uno.jpg")).toBeNull();
  });

  it("with a single tab, saving opens the product page as before", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderPage();
    await fillProduct(user, { name: "Uno QA", price: "1000" });
    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull());
  });
});
