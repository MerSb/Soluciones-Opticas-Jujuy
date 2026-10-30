import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminNewProductPage } from "../src/pages/admin/AdminNewProductPage";
import { ThemeProvider } from "../src/app/theme";
import { STORAGE_KEY } from "../src/lib/product-drafts";

// Multi-tab new-product page. Fictional data only; Cloudinary is never
// reached (its upload URL is answered by the stub).

// Many typed fields across tabs: slower than 5 s when the whole suite runs.
vi.setConfig({ testTimeout: 20_000 });

const BRANDS = [{ id: "b1", name: "Marca QA", slug: "marca-qa", deletedAt: null }];
// As GET /api/admin/lens-types returns them (one retired: never offered).
const LENS_TYPES = [
  { id: "l1", name: "Bifocales", deletedAt: null },
  { id: "l2", name: "Monofocal", deletedAt: null },
  { id: "l3", name: "Multifocales", deletedAt: null },
  { id: "l4", name: "Retirado QA", deletedAt: "2026-01-01T00:00:00.000Z" },
];
const CATEGORIES = [{ id: "c1", name: "Anteojos de Sol", slug: "sol", deletedAt: null }];

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function stubBackend(
  options: {
    failCloudinaryOnce?: boolean;
    /** The API saves the first photo but its answer never arrives. */
    loseRegisterAnswerOnce?: boolean;
    /** The first batch of colors is refused: one SKU is already in use. */
    refuseBatchOnce?: boolean;
    /** Saving the compatible lens types fails once. */
    failLensTypesOnce?: boolean;
    failProductCreate?: boolean;
    /** Holds the product creation until this promise resolves. */
    holdProductCreate?: Promise<void>;
  } = {},
) {
  const calls: Call[] = [];
  let products = 0;
  let variants = 0;
  let signatures = 0;
  let refusedBatch = false;
  let lensFailures = options.failLensTypesOnce ? 1 : 0;
  let cloudinaryFailures = options.failCloudinaryOnce ? 1 : 0;
  let lostAnswers = options.loseRegisterAnswerOnce ? 1 : 0;
  // Saved photos per variant, as the admin product read returns them.
  const saved = new Map<string, { id: string; cloudinaryPublicId: string }[]>();
  const stored = new Set<string>(); // files "Cloudinary" has
  const fetchMock = vi.fn(async (raw: string | URL, init?: RequestInit) => {
    const url = new URL(raw);
    const method = init?.method ?? "GET";
    // For Cloudinary, the uploaded file's name: proves which photo went first.
    const body =
      typeof init?.body === "string"
        ? JSON.parse(init.body)
        : init?.body instanceof FormData
          ? (init.body.get("file") as File).name
          : null;
    calls.push({ method, path: url.pathname, body });
    if (url.pathname === "/api/auth/me" || url.pathname === "/api/auth/refresh") {
      return json(401, { error: { code: "UNAUTHENTICATED", message: "No autenticado." } });
    }
    if (url.hostname === "api.cloudinary.com") {
      if (cloudinaryFailures > 0) {
        cloudinaryFailures -= 1;
        throw new TypeError("Failed to fetch");
      }
      // Like Cloudinary: stored under the public_id our API signed.
      const publicId = (init!.body as FormData).get("public_id") as string;
      stored.add(publicId);
      return json(200, { public_id: publicId });
    }
    if (method === "GET" && url.pathname === "/api/admin/brands") return json(200, BRANDS);
    if (method === "GET" && url.pathname === "/api/admin/lens-types") return json(200, LENS_TYPES);
    const lenses = url.pathname.match(/^\/api\/admin\/products\/(p\d+)\/lens-types$/);
    if (method === "PUT" && lenses) {
      if (lensFailures > 0) {
        lensFailures -= 1;
        throw new TypeError("Failed to fetch");
      }
      return json(200, { id: lenses[1] });
    }
    if (method === "GET" && url.pathname === "/api/admin/categories") return json(200, CATEGORIES);
    if (method === "GET" && url.pathname === "/api/accessories/included") {
      return json(404, { error: { code: "NOT_FOUND", message: "No." } });
    }
    if (method === "POST" && url.pathname === "/api/admin/products") {
      if (options.holdProductCreate) await options.holdProductCreate;
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
    const batch = url.pathname.match(/^\/api\/admin\/products\/(p\d+)\/variants\/batch$/);
    if (method === "POST" && batch && options.refuseBatchOnce && !refusedBatch) {
      refusedBatch = true;
      return json(409, { error: { code: "CONFLICT", message: 'El SKU "UNO-N" ya está en uso.' } });
    }
    if (method === "POST" && batch) {
      const rows = (body as { variants: { sku: string }[] }).variants;
      const skus = rows.map((row) => row.sku.toLowerCase());
      if (new Set(skus).size !== skus.length) {
        return json(409, { error: { code: "CONFLICT", message: "SKU repetido." } });
      }
      return json(
        201,
        rows.map((row) => {
          variants += 1;
          return { id: `${batch[1]}-v${variants}`, ...row };
        }),
      );
    }
    if (method === "POST" && url.pathname.endsWith("/images/sign-upload")) {
      return json(200, {
        cloudName: "demo",
        apiKey: "test",
        timestamp: 1,
        signature: "sig",
        publicId: `test/upload-${(signatures += 1)}`,
        allowedFormats: "jpg,png,webp",
      });
    }
    if (method === "POST" && url.pathname.endsWith("/images")) {
      const variantId = url.pathname.split("/")[6]!;
      const request = body as { cloudinaryPublicId: string; verifyUpload?: boolean };
      // Like the API: a saved public_id answers the saved image; a retry
      // whose file never reached Cloudinary is refused.
      const already = saved
        .get(variantId)
        ?.find((i) => i.cloudinaryPublicId === request.cloudinaryPublicId);
      if (already) return json(200, already);
      if (request.verifyUpload && !stored.has(request.cloudinaryPublicId)) {
        return json(409, { error: { code: "IMAGE_NOT_UPLOADED", message: "No llegó." } });
      }
      const image = { id: `img-${calls.length}`, cloudinaryPublicId: request.cloudinaryPublicId };
      saved.set(variantId, [...(saved.get(variantId) ?? []), image]);
      if (lostAnswers > 0) {
        lostAnswers -= 1;
        throw new TypeError("Failed to fetch");
      }
      return json(201, image);
    }
    const detail = url.pathname.match(/^\/api\/admin\/products\/(p\d+)$/);
    if (method === "GET" && detail) {
      const variants = [...saved].filter(([id]) => id.startsWith(`${detail[1]}-`));
      return json(200, {
        id: detail[1],
        variants: variants.map(([id, images]) => ({ id, images })),
      });
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
      {
        path: "/admin/products/new",
        element: (
          <>
            <Link to="/admin/products">Ir al listado</Link>
            <AdminNewProductPage />
          </>
        ),
      },
      { path: "/admin/products", element: <p>Listado de productos</p> },
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

interface ColorData {
  /** A palette color clicked to add the row ("Negro"). */
  color: string;
  sku?: string;
  stock?: string;
  photos?: File[];
  /** Order the thumbnails are clicked in (default: as chosen). */
  clickOrder?: string[];
}

/** The row of a color, by its heading ("Negro", "Pieza combinada: …"). */
const row = (heading: string) => within(within(panel()).getByRole("region", { name: heading }));

async function fillColorRow(
  user: ReturnType<typeof userEvent.setup>,
  heading: string,
  data: Omit<ColorData, "color">,
) {
  const r = row(heading);
  if (data.sku) await user.type(r.getByLabelText("SKU"), data.sku);
  await user.type(r.getByLabelText("Stock"), data.stock ?? "0");
  if (data.photos) {
    await user.upload(r.getByLabelText("Elegir fotos"), data.photos);
    for (const name of data.clickOrder ?? data.photos.map((file) => file.name)) {
      await user.click(r.getByRole("button", { name: new RegExp(`^${name}:`) }));
    }
  }
}

async function fillProduct(
  user: ReturnType<typeof userEvent.setup>,
  data: { name: string; price: string; colors?: ColorData[] },
) {
  const p = within(panel());
  await user.type(p.getByLabelText("Nombre"), data.name);
  await p.findByRole("option", { name: "Marca QA" });
  await user.selectOptions(p.getByLabelText("Marca"), "b1");
  await user.selectOptions(p.getByLabelText("Categoría"), "c1");
  await user.type(p.getByLabelText("Precio base (ARS)"), data.price);
  for (const color of data.colors ?? []) {
    await user.click(
      within(p.getByRole("group", { name: "Colores de la paleta" })).getByRole("button", {
        name: color.color,
      }),
    );
    await fillColorRow(user, color.color, color);
  }
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
      colors: [{ color: "Negro", sku: "UNO-1", photos: [photo("uno.jpg")] }],
    });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await fillProduct(user, {
      name: "Dos QA",
      price: "2000",
      colors: [{ color: "Rojo", sku: "DOS-1", photos: [photo("dos-a.jpg"), photo("dos-b.jpg")] }],
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
      within(within(panel()).getByRole("list", { name: "Orden final" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining("dos-a.jpg"), expect.stringContaining("dos-b.jpg")]);
  });

  it("saves the second product first: its color and photos (in click order) go to its own product, the others stay", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      colors: [{ color: "Negro", sku: "UNO-1", photos: [photo("uno.jpg")] }],
    });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await fillProduct(user, {
      name: "Dos QA",
      price: "2000",
      colors: [
        {
          color: "Rojo",
          sku: "DOS-1",
          photos: [photo("dos-a.jpg"), photo("dos-b.jpg")],
          // Clicked second-file-first: that is the order that must be saved.
          clickOrder: ["dos-b.jpg", "dos-a.jpg"],
        },
      ],
    });

    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    expect(await within(panel()).findByText("✓ «Dos QA» guardado.")).toBeInTheDocument();

    const writes = calls.filter((call) => call.method === "POST" && !call.path.startsWith("/v1_1"));
    expect(writes.map((call) => call.path)).toEqual([
      "/api/admin/products",
      "/api/admin/products/p1/variants/batch",
      "/api/admin/products/p1/variants/p1-v1/images/sign-upload",
      "/api/admin/products/p1/variants/p1-v1/images",
      "/api/admin/products/p1/variants/p1-v1/images/sign-upload",
      "/api/admin/products/p1/variants/p1-v1/images",
    ]);
    expect(writes[0]!.body).toMatchObject({ name: "Dos QA", basePrice: 2000 });
    expect(writes[1]!.body).toEqual({
      variants: [{ color: "Rojo", colorTones: ["ROJO"], sku: "DOS-1", stock: 0 }],
    });
    expect(calls.filter((call) => call.path.startsWith("/v1_1")).map((call) => call.body)).toEqual([
      "dos-b.jpg",
      "dos-a.jpg",
    ]);
    expect(writes[3]!.body).toMatchObject({
      cloudinaryPublicId: "test/upload-1",
      alt: "Dos QA — Rojo — foto 1",
      isPrimary: true,
    });
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

  it("validates: each color needs its SKU and stock; an API error is shown and nothing else is sent", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ failProductCreate: true });
    renderPage();
    await fillProduct(user, { name: "Uno QA", price: "1000" });
    await user.click(
      within(within(panel()).getByRole("group", { name: "Colores de la paleta" })).getByRole(
        "button",
        { name: "Negro" },
      ),
    );
    const submit = within(panel()).getByRole("button", { name: "Crear producto" });
    expect(submit).toBeDisabled();
    expect(
      within(panel()).getByText(/Falta el SKU de cada color, el stock de cada color/),
    ).toBeInTheDocument();

    await fillColorRow(user, "Negro", { sku: "UNO-1" });
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
      colors: [{ color: "Negro", sku: "UNO-1", photos: [photo("uno.jpg")] }],
    });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await fillProduct(user, { name: "Dos QA", price: "2000" });
    await user.click(screen.getAllByRole("tab")[0]!);
    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    expect(await within(panel()).findByRole("alert")).toHaveTextContent(
      "El producto y sus colores se crearon, pero falló la foto 1 de Negro: No pudimos conectarnos",
    );
    await user.click(within(panel()).getByRole("button", { name: "Reintentar lo pendiente" }));
    await within(panel()).findByText("✓ «Uno QA» guardado.");
    expect(
      calls.filter((call) => call.method === "POST" && call.path === "/api/admin/products"),
    ).toHaveLength(1);
    expect(
      calls.filter((call) => call.method === "POST" && call.path.endsWith("/variants/batch")),
    ).toHaveLength(1);
    // The retry first asks for the signed file (never reached Cloudinary: 409),
    // then uploads it again — one photo saved.
    const registrations = calls.filter(
      (call) => call.method === "POST" && call.path.endsWith("/images"),
    );
    expect(
      registrations.map((call) => (call.body as { verifyUpload?: boolean }).verifyUpload),
    ).toEqual([true, undefined]);
  });

  it("the API saved a photo but its answer was lost: the retry gets it back and never uploads it twice", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ loseRegisterAnswerOnce: true });
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      colors: [{ color: "Negro", sku: "UNO-1", photos: [photo("uno.jpg"), photo("dos.jpg")] }],
    });
    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    expect(await within(panel()).findByRole("alert")).toHaveTextContent("falló la foto 1");
    // It may be saved: it can't be unselected meanwhile.
    expect(within(panel()).getByRole("button", { name: /^uno.jpg:/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    await user.click(within(panel()).getByRole("button", { name: "Reintentar lo pendiente" }));
    await within(panel()).findByText("✓ «Uno QA» guardado.");
    const registrations = calls.filter(
      (call) => call.method === "POST" && call.path.endsWith("/images"),
    );
    type Registration = { cloudinaryPublicId: string; alt: string; verifyUpload?: boolean };
    const bodies = registrations.map((call) => call.body as Registration);
    // Photo 1 sent again with the same public_id: the API answers the saved one.
    expect(bodies.map((b) => [b.alt, b.verifyUpload])).toEqual([
      ["Uno QA — Negro — foto 1", undefined],
      ["Uno QA — Negro — foto 1", true],
      ["Uno QA — Negro — foto 2", undefined],
    ]);
    expect(bodies[1]!.cloudinaryPublicId).toBe(bodies[0]!.cloudinaryPublicId);
    expect(calls.filter((call) => call.path.endsWith("/sign-upload"))).toHaveLength(2);
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
      colors: [{ color: "Negro", sku: "UNO-1", photos: [photo("uno.jpg")] }],
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

  it("while a product is being saved, its tab cannot be closed and the page cannot be left", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const calls = stubBackend({
      holdProductCreate: new Promise<void>((resolve) => (release = resolve)),
    });
    const confirm = vi.spyOn(window, "confirm");
    renderPage();
    await fillProduct(user, { name: "Uno QA", price: "1000" });
    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    await fillProduct(user, { name: "Dos QA", price: "2000" });
    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    expect(await within(panel()).findByRole("button", { name: "Guardando…" })).toBeDisabled();

    const close = screen.getByRole("button", { name: "Cerrar Dos QA" });
    expect(close).toBeDisabled();
    expect(close).toHaveAttribute("title", "Esperá a que termine de guardarse");
    await user.click(close);
    expect(screen.getAllByRole("tab")).toHaveLength(2);

    await user.click(screen.getByRole("link", { name: "Ir al listado" }));
    expect(
      await screen.findByText(/Esperá a que termine de guardarse el producto/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Listado de productos")).toBeNull();
    expect(confirm).not.toHaveBeenCalled();

    release();
    expect(await within(panel()).findByText("✓ «Dos QA» guardado.")).toBeInTheDocument();
    expect(
      calls.filter((call) => call.method === "POST" && call.path === "/api/admin/products"),
    ).toHaveLength(1);
    await waitFor(() =>
      expect(screen.queryByText(/Esperá a que termine de guardarse el producto/)).toBeNull(),
    );
  });

  it("leaving with unsaved changes asks first; untouched or saved tabs leave freely", async () => {
    const user = userEvent.setup();
    stubBackend();
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderPage();
    await fillProduct(user, { name: "Uno QA", price: "1000" });
    await user.click(screen.getByRole("link", { name: "Ir al listado" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("las fotos elegidas se pierden"));
    expect(within(panel()).getByLabelText("Nombre")).toHaveValue("Uno QA");
    await user.click(screen.getByRole("link", { name: "Ir al listado" }));
    expect(await screen.findByText("Listado de productos")).toBeInTheDocument();
    // What was typed stays as a draft for later.
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Uno QA");
  });

  describe("colors on the palette", () => {
    const palette = () =>
      within(within(panel()).getByRole("group", { name: "Colores de la paleta" }));

    it("shows the 15 palette colors, for frames and for accessories", async () => {
      const user = userEvent.setup();
      stubBackend();
      renderPage();
      await within(panel()).findByRole("option", { name: "Marca QA" });
      expect(palette().getAllByRole("button")).toHaveLength(15);
      await user.click(within(panel()).getByRole("radio", { name: "Accesorio" }));
      expect(palette().getAllByRole("button")).toHaveLength(15);
    });

    it("several colors: each one its own variant, with its own SKU, stock and photos", async () => {
      const user = userEvent.setup();
      const calls = stubBackend();
      renderPage();
      await fillProduct(user, {
        name: "Uno QA",
        price: "1000",
        colors: [
          { color: "Negro", sku: "UNO-N", stock: "3", photos: [photo("negro.jpg")] },
          {
            color: "Rojo",
            sku: "UNO-R",
            stock: "1",
            photos: [photo("rojo-1.jpg"), photo("rojo-2.jpg")],
          },
        ],
      });
      await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
      expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();

      const batch = calls.find((call) => call.path.endsWith("/variants/batch"))!;
      expect(batch.body).toEqual({
        variants: [
          { color: "Negro", colorTones: ["NEGRO"], sku: "UNO-N", stock: 3 },
          { color: "Rojo", colorTones: ["ROJO"], sku: "UNO-R", stock: 1 },
        ],
      });
      const registrations = calls.filter(
        (call) => call.method === "POST" && call.path.endsWith("/images"),
      );
      expect(
        registrations.map((call) => [
          call.path.split("/")[6],
          (call.body as { alt: string }).alt,
          (call.body as { isPrimary: boolean }).isPrimary,
        ]),
      ).toEqual([
        ["p1-v1", "Uno QA — Negro — foto 1", true],
        ["p1-v2", "Uno QA — Rojo — foto 1", true],
        ["p1-v2", "Uno QA — Rojo — foto 2", false],
      ]);
      expect(
        calls.filter((call) => call.path.startsWith("/v1_1")).map((call) => call.body),
      ).toEqual(["negro.jpg", "rojo-1.jpg", "rojo-2.jpg"]);
    });

    it("clicking a chosen color again removes its row", async () => {
      const user = userEvent.setup();
      stubBackend();
      renderPage();
      await fillProduct(user, { name: "Uno QA", price: "1000" });
      await user.click(palette().getByRole("button", { name: "Azul" }));
      expect(palette().getByRole("button", { name: "Azul" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(within(panel()).getByRole("region", { name: "Azul" })).toBeInTheDocument();
      await user.click(palette().getByRole("button", { name: "Azul" }));
      expect(within(panel()).queryByRole("region", { name: "Azul" })).toBeNull();
    });

    const combineBox = () =>
      within(panel()).getByRole("checkbox", { name: /Este armazón combina varios colores/ });
    const pieceTones = (n = 1) =>
      within(within(panel()).getByRole("group", { name: `Tonos de la pieza combinada ${n}` }));

    it("one palette; the combined piece is behind an unticked checkbox", async () => {
      stubBackend();
      renderPage();
      await within(panel()).findByRole("option", { name: "Marca QA" });
      expect(
        within(panel()).getAllByRole("group", { name: /Colores de la paleta|Tonos de la pieza/ }),
      ).toHaveLength(1);
      expect(combineBox()).not.toBeChecked();
    });

    it("a single combined piece: one variant with its tones in order, no independent colors needed", async () => {
      const user = userEvent.setup();
      const calls = stubBackend();
      renderPage();
      await fillProduct(user, { name: "Uno QA", price: "1000" });
      await user.click(combineBox());
      await user.click(pieceTones().getByRole("button", { name: "Rojo" }));
      expect(
        within(panel()).getByText(/al menos dos tonos en cada pieza combinada/),
      ).toBeInTheDocument();
      await user.click(pieceTones().getByRole("button", { name: /^Negro/ }));
      await fillColorRow(user, "Pieza combinada: Rojo y negro", { sku: "UNO-RN", stock: "2" });
      expect(row("Pieza combinada: Rojo y negro").getByLabelText("Nombre del color")).toHaveValue(
        "Rojo y negro",
      );
      await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
      expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();
      expect(calls.find((call) => call.path.endsWith("/variants/batch"))!.body).toEqual({
        variants: [
          { color: "Rojo y negro", colorTones: ["ROJO", "NEGRO"], sku: "UNO-RN", stock: 2 },
        ],
      });
    });

    it("independent colors and a combined piece in the same product, each with its own photos", async () => {
      const user = userEvent.setup();
      const calls = stubBackend();
      renderPage();
      await fillProduct(user, {
        name: "Uno QA",
        price: "1000",
        colors: [{ color: "Negro", sku: "UNO-N", stock: "1", photos: [photo("negro.jpg")] }],
      });
      await user.click(combineBox());
      await user.click(pieceTones().getByRole("button", { name: "Rojo" }));
      await user.click(pieceTones().getByRole("button", { name: /^Negro/ }));
      await fillColorRow(user, "Pieza combinada: Rojo y negro", {
        sku: "UNO-RN",
        stock: "2",
        photos: [photo("rn.jpg")],
      });
      await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
      expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();
      expect(calls.find((call) => call.path.endsWith("/variants/batch"))!.body).toEqual({
        variants: [
          { color: "Negro", colorTones: ["NEGRO"], sku: "UNO-N", stock: 1 },
          { color: "Rojo y negro", colorTones: ["ROJO", "NEGRO"], sku: "UNO-RN", stock: 2 },
        ],
      });
      const photos = calls.filter((c) => c.method === "POST" && c.path.endsWith("/images"));
      expect(photos.map((c) => [c.path.split("/")[6], (c.body as { alt: string }).alt])).toEqual([
        ["p1-v1", "Uno QA — Negro — foto 1"],
        ["p1-v2", "Uno QA — Rojo y negro — foto 1"],
      ]);
    });

    it("unticking hides the combined piece: asks before discarding typed data, and writes nothing", async () => {
      const user = userEvent.setup();
      const calls = stubBackend();
      const confirm = vi
        .spyOn(window, "confirm")
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);
      renderPage();
      await fillProduct(user, { name: "Uno QA", price: "1000" });
      await user.click(combineBox());
      await user.click(combineBox()); // nothing typed: no question
      expect(confirm).not.toHaveBeenCalled();
      expect(combineBox()).not.toBeChecked();

      await user.click(combineBox());
      await user.click(pieceTones().getByRole("button", { name: "Azul" }));
      await user.click(combineBox()); // cancelled: everything stays
      expect(combineBox()).toBeChecked();
      expect(pieceTones().getByRole("button", { name: "Azul" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await user.click(combineBox()); // accepted: gone
      expect(
        within(panel()).queryByRole("group", { name: /Tonos de la pieza combinada/ }),
      ).toBeNull();
      expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
    });

    it("a draft saved with the previous 'Una pieza de varios tonos' mode comes back ticked", async () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          {
            id: "old",
            fields: {
              kind: "FRAME",
              name: "Viejo QA",
              brandId: "",
              categoryId: "",
              shape: "",
              basePrice: "",
              accessoryRole: "",
              soldIndividually: true,
              variantMode: "combined",
              variants: [
                {
                  key: "k1",
                  tones: ["ROJO", "NEGRO"],
                  name: "Rojo y negro",
                  sku: "V-RN",
                  stock: "1",
                },
              ],
            },
            progress: { productId: null, variantIds: null, uploadedPhotos: [] },
            photoCount: 0,
          },
        ]),
      );
      stubBackend();
      renderPage();
      const r = within(
        await screen.findByRole("region", { name: "Pieza combinada: Rojo y negro" }),
      );
      expect(r.getByLabelText("SKU")).toHaveValue("V-RN");
      expect(combineBox()).toBeChecked();
    });

    it("never sends repeated SKUs, and never generates one", async () => {
      const user = userEvent.setup();
      const calls = stubBackend();
      renderPage();
      await fillProduct(user, {
        name: "Uno QA",
        price: "1000",
        colors: [
          { color: "Negro", sku: "UNO-1" },
          { color: "Blanco", sku: "uno-1" },
        ],
      });
      expect(row("Blanco").getByText("SKU repetido en la lista.")).toBeInTheDocument();
      expect(within(panel()).getByRole("button", { name: "Crear producto" })).toBeDisabled();
      await user.click(palette().getByRole("button", { name: "Verde" }));
      expect(row("Verde").getByLabelText("SKU")).toHaveValue("");
      expect(calls.some((call) => call.path.includes("/variants"))).toBe(false);
    });

    it("a color outside the palette is kept by its name, without tones", async () => {
      const user = userEvent.setup();
      const calls = stubBackend();
      renderPage();
      await fillProduct(user, { name: "Uno QA", price: "1000" });
      await user.type(
        within(panel()).getByLabelText("Otro color (fuera de la paleta)"),
        "Animal print",
      );
      await user.click(within(panel()).getByRole("button", { name: "Agregar color" }));
      await fillColorRow(user, "Animal print (fuera de la paleta)", { sku: "UNO-AP" });
      await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
      expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();
      expect(calls.find((call) => call.path.endsWith("/variants/batch"))!.body).toEqual({
        variants: [{ color: "Animal print", sku: "UNO-AP", stock: 0 }],
      });
    });

    it("a draft saved by the previous form (one free-text color) comes back as one row", async () => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          {
            id: "old",
            fields: {
              kind: "FRAME",
              name: "Viejo QA",
              brandId: "",
              categoryId: "",
              shape: "",
              basePrice: "",
              accessoryRole: "",
              soldIndividually: true,
              color: "Negro mate",
              sku: "VIE-1",
              stock: "4",
            },
            progress: { productId: null, variantId: null, uploadedPhotos: 0 },
            photoCount: 0,
          },
        ]),
      );
      stubBackend();
      renderPage();
      const r = within(
        await screen.findByRole("region", { name: "Negro mate (fuera de la paleta)" }),
      );
      expect(r.getByLabelText("Nombre del color")).toHaveValue("Negro mate");
      expect(r.getByLabelText("SKU")).toHaveValue("VIE-1");
      expect(r.getByLabelText("Stock")).toHaveValue(4);
    });
  });

  it("a refused color keeps everything typed: fix it and retry, never creating the product twice", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ refuseBatchOnce: true });
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      colors: [
        { color: "Negro", sku: "UNO-N", stock: "3", photos: [photo("negro.jpg")] },
        { color: "Rojo", sku: "UNO-R", stock: "1" },
      ],
    });
    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    expect(await within(panel()).findByRole("alert")).toHaveTextContent(
      'El producto se creó, pero no sus colores (no se creó ninguno): El SKU "UNO-N" ya está en uso.',
    );
    // Nothing typed or chosen was lost, and the colors can still be edited.
    expect(within(panel()).getByLabelText("Nombre")).toHaveValue("Uno QA");
    expect(row("Negro").getByLabelText("SKU")).toHaveValue("UNO-N");
    expect(row("Negro").getByLabelText("Stock")).toHaveValue(3);
    expect(row("Rojo").getByLabelText("SKU")).toHaveValue("UNO-R");
    expect(row("Negro").getByRole("button", { name: /^negro.jpg:/ })).toBeInTheDocument();

    await user.clear(row("Negro").getByLabelText("SKU"));
    await user.type(row("Negro").getByLabelText("SKU"), "UNO-N2");
    await user.click(within(panel()).getByRole("button", { name: "Reintentar lo pendiente" }));
    expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();
    expect(
      calls.filter((call) => call.method === "POST" && call.path === "/api/admin/products"),
    ).toHaveLength(1);
    const batches = calls.filter((call) => call.path.endsWith("/variants/batch"));
    expect(batches).toHaveLength(2);
    expect(
      (batches[1]!.body as { variants: { sku: string }[] }).variants.map((v) => v.sku),
    ).toEqual(["UNO-N2", "UNO-R"]);
  });

  it("a photo of the second color fails: it says which one, marks it, and the retry creates nothing twice", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ failCloudinaryOnce: true });
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      colors: [
        { color: "Negro", sku: "UNO-N" },
        { color: "Rojo", sku: "UNO-R", photos: [photo("rojo.jpg")] },
      ],
    });
    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    expect(await within(panel()).findByRole("alert")).toHaveTextContent(
      "El producto y sus colores se crearon, pero falló la foto 1 de Rojo",
    );
    expect(row("Rojo").getByRole("button", { name: /^rojo.jpg:.*falló/ })).toBeInTheDocument();

    await user.click(within(panel()).getByRole("button", { name: "Reintentar lo pendiente" }));
    expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();
    expect(
      calls.filter((c) => c.method === "POST" && c.path === "/api/admin/products"),
    ).toHaveLength(1);
    expect(calls.filter((c) => c.path.endsWith("/variants/batch"))).toHaveLength(1);
    const saved = calls.filter(
      (c) =>
        c.method === "POST" &&
        c.path.endsWith("/images") &&
        !(c.body as { verifyUpload?: boolean }).verifyUpload,
    );
    expect(saved.map((c) => c.path.split("/")[6])).toEqual(["p1-v2"]);
  });

  describe("compatible lens types at creation", () => {
    const lensBox = (name: string) =>
      within(
        within(panel()).getByRole("group", { name: "Cristales compatibles (opcional)" }),
      ).getByRole("checkbox", { name });
    const lensPuts = (calls: { method: string; path: string; body: unknown }[]) =>
      calls.filter((call) => call.method === "PUT" && call.path.endsWith("/lens-types"));

    it("lists the types from the API (never a retired one) and only for frames", async () => {
      const user = userEvent.setup();
      stubBackend();
      renderPage();
      const group = await within(panel()).findByRole("group", {
        name: "Cristales compatibles (opcional)",
      });
      await within(group).findByRole("checkbox", { name: "Bifocales" });
      expect(
        within(group)
          .getAllByRole("checkbox")
          .map((box) => box.closest("label")!.textContent),
      ).toEqual(["Bifocales", "Monofocal", "Multifocales"]);
      await user.click(within(panel()).getByRole("radio", { name: "Accesorio" }));
      expect(
        within(panel()).queryByRole("group", { name: "Cristales compatibles (opcional)" }),
      ).toBeNull();
    });

    it("none chosen: no association is sent", async () => {
      const user = userEvent.setup();
      const calls = stubBackend();
      renderPage();
      await fillProduct(user, { name: "Uno QA", price: "1000" });
      await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
      expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();
      expect(lensPuts(calls)).toHaveLength(0);
    });

    it("one type: saved with the existing endpoint right after the product", async () => {
      const user = userEvent.setup();
      const calls = stubBackend();
      renderPage();
      await fillProduct(user, { name: "Uno QA", price: "1000" });
      await user.click(await waitFor(() => lensBox("Monofocal")));
      await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
      expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();
      expect(lensPuts(calls).map((call) => [call.path, call.body])).toEqual([
        ["/api/admin/products/p1/lens-types", { lensTypeIds: ["l2"] }],
      ]);
    });

    it("several types, with colors and photos: everything goes to the new product, once", async () => {
      const user = userEvent.setup();
      const calls = stubBackend();
      renderPage();
      await fillProduct(user, {
        name: "Uno QA",
        price: "1000",
        colors: [{ color: "Negro", sku: "UNO-N", stock: "2", photos: [photo("negro.jpg")] }],
      });
      await user.click(await waitFor(() => lensBox("Bifocales")));
      await user.click(lensBox("Multifocales"));
      await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
      expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();
      const writes = calls.filter((c) => c.method !== "GET" && !c.path.startsWith("/v1_1"));
      expect(writes.map((c) => `${c.method} ${c.path}`)).toEqual([
        "POST /api/admin/products",
        "PUT /api/admin/products/p1/lens-types",
        "POST /api/admin/products/p1/variants/batch",
        "POST /api/admin/products/p1/variants/p1-v1/images/sign-upload",
        "POST /api/admin/products/p1/variants/p1-v1/images",
      ]);
      expect(writes[1]!.body).toEqual({ lensTypeIds: ["l1", "l3"] });
    });

    it("if saving them fails: the product exists, the choice stays, and the retry only saves the lenses", async () => {
      const user = userEvent.setup();
      const calls = stubBackend({ failLensTypesOnce: true });
      renderPage();
      await fillProduct(user, { name: "Uno QA", price: "1000" });
      await user.click(await waitFor(() => lensBox("Bifocales")));
      await user.click(lensBox("Monofocal"));
      await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));

      expect(await within(panel()).findByRole("alert")).toHaveTextContent(
        "El producto se creó, pero no sus cristales compatibles: No pudimos conectarnos",
      );
      expect(lensBox("Bifocales")).toBeChecked();
      expect(lensBox("Monofocal")).toBeChecked();
      expect(lensBox("Multifocales")).not.toBeChecked();

      await user.click(within(panel()).getByRole("button", { name: "Reintentar lo pendiente" }));
      expect(await screen.findByText("Ficha del producto")).toBeInTheDocument();
      expect(
        calls.filter((c) => c.method === "POST" && c.path === "/api/admin/products"),
      ).toHaveLength(1);
      // Same full list again: the endpoint replaces it, so nothing can repeat.
      expect(lensPuts(calls).map((call) => call.body)).toEqual([
        { lensTypeIds: ["l1", "l2"] },
        { lensTypeIds: ["l1", "l2"] },
      ]);
    });
  });
});
