import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, RouterProvider, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminNewProductPage } from "../src/pages/admin/AdminNewProductPage";
import { ThemeProvider } from "../src/app/theme";
import { STORAGE_KEY } from "../src/lib/product-drafts";

// The new-product page, on one screen (docs/ALTA_PRODUCTOS.md). Fictional
// data only; Cloudinary is never reached (its upload URL is answered by the
// stub). «Cristales compatibles» is suspended (src/lib/features.ts): the
// tests of that section switch it on.

const features = vi.hoisted(() => ({ lens: false }));
vi.mock("../src/lib/features", () => ({
  get LENS_COMPATIBILITY_ENABLED() {
    return features.lens;
  },
}));

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
    /** SKUs another product already uses (answered by …/similar). */
    takenSkus?: string[];
    /** The SKU check (…/similar) can't be reached. */
    failSimilar?: boolean;
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
    if (method === "GET" && url.pathname === "/api/admin/products/similar") {
      if (options.failSimilar) throw new TypeError("Failed to fetch");
      const sku = url.searchParams.get("sku");
      const taken = (options.takenSkus ?? []).find((s) => s.toLowerCase() === sku?.toLowerCase());
      return json(
        200,
        sku && taken
          ? [
              {
                id: "p-old",
                name: "Modelo viejo QA",
                brandName: "Marca QA",
                deletedAt: null,
                reason: "SAME_SKU",
                sku: taken,
              },
            ]
          : [],
      );
    }
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

function ProductPageStub() {
  const state = useLocation().state as { created?: string } | null;
  return <p>Ficha del producto{state?.created ? ` (creado: ${state.created})` : ""}</p>;
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
      { path: "/admin/products/:id", element: <ProductPageStub /> },
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

interface VariantData {
  /** The palette option ("Negro", "Combinado", "Otro color…"). */
  color: string;
  /** «Combinado»: its tones, in order. */
  tones?: string[];
  /** «Otro color…»: the typed name. */
  other?: string;
  material?: string;
  sku?: string;
  stock?: string;
  photos?: File[];
  /** Order the thumbnails are clicked in (default: as chosen). */
  clickOrder?: string[];
}

/** «Plateado y azul»: how a combined piece is named. */
const tonesLabel = (tones: string[]) =>
  `${tones.slice(0, -1).join(", ")} y ${tones.at(-1)!.toLowerCase()}`;

/** An added variant, by its heading ("Variante 1: Negro"). */
const row = (heading: string) => within(screen.getByRole("region", { name: heading }));
/** The form of the variant being typed (color, material, SKU, stock). */
const newVariant = () => within(screen.getByRole("group", { name: "Variante nueva" }));
const colors = () =>
  within(newVariant().getByRole("radiogroup", { name: "Color de la variante nueva" }));
const createButton = () => screen.getByRole("button", { name: "Crear producto" });
type User = ReturnType<typeof userEvent.setup>;

async function addVariant(user: User, data: VariantData) {
  const form = newVariant();
  await user.click(form.getByRole("radio", { name: data.color }));
  for (const tone of data.tones ?? []) {
    await user.click(
      within(form.getByRole("group", { name: "Tonos de la pieza combinada" })).getByRole("button", {
        name: new RegExp(`^${tone}`),
      }),
    );
  }
  if (data.other) await user.type(form.getByLabelText("Nombre del color"), data.other);
  if (data.material) await user.type(form.getByLabelText("Material"), data.material);
  if (data.sku) await user.type(form.getByLabelText("SKU"), data.sku);
  await user.type(form.getByLabelText("Stock"), data.stock ?? "0");
  await user.click(form.getByRole("button", { name: "Agregar variante" }));
}

/** Photos are chosen in «Fotografías», per variant. */
async function choosePhotos(
  user: User,
  heading: string,
  data: Pick<VariantData, "photos" | "clickOrder">,
) {
  if (!data.photos) return;
  const block = within(screen.getByRole("region", { name: `Fotos de ${heading}` }));
  await user.upload(block.getByLabelText("Elegir fotos"), data.photos);
  for (const name of data.clickOrder ?? data.photos.map((file) => file.name)) {
    await user.click(block.getByRole("button", { name: new RegExp(`^${name}:`) }));
  }
}

async function fillGeneral(user: User, data: { name: string; price: string }) {
  await user.type(screen.getByLabelText("Nombre"), data.name);
  await screen.findByRole("option", { name: "Marca QA" });
  await user.selectOptions(screen.getByLabelText("Marca"), "b1");
  await user.selectOptions(screen.getByLabelText("Categoría"), "c1");
  await user.type(screen.getByLabelText("Precio base (ARS)"), data.price);
}

async function fillProduct(
  user: User,
  data: { name: string; price: string; variants?: VariantData[] },
) {
  await fillGeneral(user, data);
  for (const [index, variant] of (data.variants ?? []).entries()) {
    await addVariant(user, variant);
    const name =
      variant.color === "Otro color…"
        ? `${variant.other} (fuera de la paleta)`
        : variant.color === "Combinado"
          ? tonesLabel(variant.tones ?? [])
          : variant.color;
    await choosePhotos(user, `Variante ${index + 1}: ${name}`, variant);
  }
}

const writes = (calls: Call[]) =>
  calls.filter((call) => call.method !== "GET" && !call.path.startsWith("/v1_1"));
const batchBody = (calls: Call[]) =>
  calls.find((call) => call.path.endsWith("/variants/batch"))!.body;

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
  features.lens = false;
});

describe("AdminNewProductPage — one page", () => {
  it("has the four sections in order, one «Crear producto», no tabs and no «Cristales compatibles»", async () => {
    const calls = stubBackend();
    renderPage();
    await screen.findByRole("option", { name: "Marca QA" });
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("button", { name: "+ Nuevo producto" })).toBeNull();
    expect(
      screen
        .getAllByRole("region")
        .map((r) => r.getAttribute("aria-labelledby") && r.querySelector("h3")?.textContent)
        .filter(Boolean),
    ).toEqual([
      "Datos generales",
      "Características y medidas",
      "Colores, material, SKU y stock",
      "Fotografías",
    ]);
    expect(screen.getAllByRole("button", { name: /^Crear/ })).toHaveLength(1);
    expect(screen.queryByText(/Cristales compatibles/)).toBeNull();
    expect(calls.some((call) => call.path.includes("lens-types"))).toBe(false);
  });

  it("creates a complete product from one page and opens it, saying it was created", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillGeneral(user, { name: "Uno QA", price: "1000" });
    await user.selectOptions(screen.getByLabelText("Forma"), "Cat-eye");
    await user.click(screen.getByRole("button", { name: /Moderno/ }));
    await user.type(screen.getByLabelText("Ancho del lente (mm)"), "52");
    await user.type(screen.getByLabelText("Ancho del puente (mm)"), "18");
    await addVariant(user, {
      color: "Combinado",
      tones: ["Plateado", "Azul"],
      material: "Metal",
      sku: "MOD-125",
      stock: "4",
    });
    await choosePhotos(user, "Variante 1: Plateado y azul", { photos: [photo("pa.jpg")] });
    await addVariant(user, { color: "Negro", material: "Acetato", sku: "MOD-126", stock: "2" });
    await user.click(createButton());
    expect(await screen.findByText("Ficha del producto (creado: Uno QA)")).toBeInTheDocument();

    expect(writes(calls).map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST /api/admin/products",
      "POST /api/admin/products/p1/variants/batch",
      "POST /api/admin/products/p1/variants/p1-v1/images/sign-upload",
      "POST /api/admin/products/p1/variants/p1-v1/images",
    ]);
    expect(writes(calls)[0]!.body).toEqual({
      name: "Uno QA",
      brandId: "b1",
      categoryId: "c1",
      shape: "Cat-eye",
      basePrice: 1000,
      styles: ["MODERN"],
      lensWidth: 52,
      bridgeWidth: 18,
      templeLength: null,
      lensHeight: null,
      frameWidth: null,
    });
    // «Combinado» Plateado + Azul: ONE variant, one SKU, one stock.
    expect(batchBody(calls)).toEqual({
      variants: [
        {
          color: "Plateado y azul",
          material: "Metal",
          colorTones: ["PLATEADO", "AZUL"],
          sku: "MOD-125",
          stock: 4,
        },
        { color: "Negro", material: "Acetato", colorTones: ["NEGRO"], sku: "MOD-126", stock: 2 },
      ],
    });
    expect(writes(calls)[3]!.body).toMatchObject({
      alt: "Uno QA — Plateado y azul — foto 1",
      isPrimary: true,
    });
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull());
  });

  it("nothing required typed: errors next to the fields, the first one focused, nothing sent", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await screen.findByRole("option", { name: "Marca QA" });
    await user.type(screen.getByLabelText("Ancho del puente (mm)"), "18");
    await user.click(createButton());
    expect(screen.getByLabelText("Nombre")).toHaveFocus();
    expect(screen.getByLabelText("Nombre")).toHaveAccessibleDescription(
      expect.stringContaining("Escribí el nombre del producto."),
    );
    expect(screen.getByLabelText("Marca")).toHaveAccessibleDescription("Elegí la marca.");
    expect(screen.getByLabelText("Categoría")).toHaveAccessibleDescription(
      expect.stringContaining("Elegí la categoría."),
    );
    expect(screen.getByLabelText("Precio base (ARS)")).toHaveAccessibleDescription(
      "Ingresá el precio: mayor que 0.",
    );
    const summary = screen
      .getAllByRole("alert")
      .find((alert) => alert.textContent?.includes("Revisá estos datos"))!;
    expect(summary).toHaveTextContent("Revisá estos datos antes de crear el producto:");
    // A link of the summary takes you to its field.
    await user.click(within(summary).getByRole("button", { name: "Elegí la marca" }));
    expect(screen.getByLabelText("Marca")).toHaveFocus();
    expect(writes(calls)).toEqual([]);
    // What was typed stays; fixing a field clears its error.
    expect(screen.getByLabelText("Ancho del puente (mm)")).toHaveValue(18);
    await user.type(screen.getByLabelText("Nombre"), "Uno QA");
    expect(screen.queryByText("Escribí el nombre del producto.")).toBeNull();
  });

  it("validates measurements in mm, by field, and sends them once they are right", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillGeneral(user, { name: "Uno QA", price: "1000" });
    await user.type(screen.getByLabelText("Largo de patilla (mm)"), "600");
    await user.click(createButton());
    const temple = screen.getByLabelText("Largo de patilla (mm)");
    expect(temple).toHaveFocus();
    expect(temple).toHaveAccessibleDescription("Ingresá un número en mm, mayor que 0 y hasta 500.");
    expect(writes(calls)).toEqual([]);
    await user.clear(temple);
    await user.type(temple, "140");
    await user.click(createButton());
    expect(await screen.findByText(/Ficha del producto/)).toBeInTheDocument();
    expect(writes(calls)[0]!.body).toMatchObject({ templeLength: 140, lensWidth: null });
  });

  it("a variant left half-typed blocks «Crear producto»: it must be added or discarded", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillGeneral(user, { name: "Uno QA", price: "1000" });
    await user.click(colors().getByRole("radio", { name: "Rojo" }));
    await user.type(newVariant().getByLabelText("SKU"), "UNO-R");
    await user.click(createButton());
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
      "Agregá esta variante a la lista («Agregar variante») o descartala.",
    );
    expect(colors().getByRole("radio", { name: "Rojo" })).toHaveFocus();
    expect(writes(calls)).toEqual([]);
    expect(newVariant().getByLabelText("SKU")).toHaveValue("UNO-R");
  });

  it("a SKU another product uses is said next to it before creating anything", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ takenSkus: ["MOD-OLD"] });
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [
        { color: "Negro", sku: "MOD-1" },
        { color: "Azul", sku: "mod-old" },
      ],
    });
    await user.click(createButton());
    const sku = row("Variante 2: Azul").getByLabelText("SKU");
    await waitFor(() => expect(sku).toHaveFocus());
    expect(sku).toHaveAccessibleDescription("Ya existe en «Modelo viejo QA»: usá otro código.");
    expect(writes(calls)).toEqual([]);
    await user.clear(sku);
    await user.type(sku, "MOD-2");
    await user.click(createButton());
    expect(await screen.findByText(/Ficha del producto/)).toBeInTheDocument();
    expect(writes(calls).filter((c) => c.path === "/api/admin/products")).toHaveLength(1);
  });

  it("if the SKU check can't be reached, nothing is created and everything stays", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ failSimilar: true });
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [{ color: "Negro", sku: "MOD-1" }],
    });
    await user.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos verificar los SKU, así que no se creó nada",
    );
    expect(writes(calls)).toEqual([]);
    expect(row("Variante 1: Negro").getByLabelText("SKU")).toHaveValue("MOD-1");
  });

  it("an API error keeps everything typed", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ failProductCreate: true });
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [{ color: "Negro", sku: "UNO-1" }],
    });
    await user.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ya existe un producto con ese nombre.",
    );
    expect(calls.some((call) => call.path.includes("/variants"))).toBe(false);
    expect(screen.getByLabelText("Nombre")).toHaveValue("Uno QA");
    expect(row("Variante 1: Negro").getByLabelText("SKU")).toHaveValue("UNO-1");
  });

  it("a double click creates the product once", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillProduct(user, { name: "Uno QA", price: "1000" });
    await user.dblClick(createButton());
    await screen.findByText(/Ficha del producto/);
    expect(
      calls.filter((call) => call.method === "POST" && call.path === "/api/admin/products"),
    ).toHaveLength(1);
  });

  it("a network error while uploading a photo: the retry continues, never creating the product again", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ failCloudinaryOnce: true });
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [{ color: "Negro", sku: "UNO-1", photos: [photo("uno.jpg")] }],
    });
    await user.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El producto y sus variantes se crearon, pero falló la foto 1 de Negro: No pudimos conectarnos",
    );
    await user.click(screen.getByRole("button", { name: "Reintentar lo pendiente" }));
    await screen.findByText(/Ficha del producto/);
    expect(
      calls.filter((call) => call.method === "POST" && call.path === "/api/admin/products"),
    ).toHaveLength(1);
    expect(calls.filter((call) => call.path.endsWith("/variants/batch"))).toHaveLength(1);
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
      variants: [{ color: "Negro", sku: "UNO-1", photos: [photo("uno.jpg"), photo("dos.jpg")] }],
    });
    await user.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("falló la foto 1");
    expect(screen.getByRole("button", { name: /^uno.jpg:/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Reintentar lo pendiente" }));
    await screen.findByText(/Ficha del producto/);
    type Registration = { cloudinaryPublicId: string; alt: string; verifyUpload?: boolean };
    const bodies = calls
      .filter((call) => call.method === "POST" && call.path.endsWith("/images"))
      .map((call) => call.body as Registration);
    expect(bodies.map((b) => [b.alt, b.verifyUpload])).toEqual([
      ["Uno QA — Negro — foto 1", undefined],
      ["Uno QA — Negro — foto 1", true],
      ["Uno QA — Negro — foto 2", undefined],
    ]);
    expect(bodies[1]!.cloudinaryPublicId).toBe(bodies[0]!.cloudinaryPublicId);
    expect(calls.filter((call) => call.path.endsWith("/sign-upload"))).toHaveLength(2);
  });

  it("refused variants keep everything typed: fix and retry, never creating the product twice", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ refuseBatchOnce: true });
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [
        { color: "Negro", sku: "UNO-N", stock: "3", photos: [photo("negro.jpg")] },
        { color: "Rojo", sku: "UNO-R", stock: "1" },
      ],
    });
    await user.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      'El producto se creó, pero no sus variantes (no se creó ninguna): El SKU "UNO-N" ya está en uso.',
    );
    expect(screen.getByLabelText("Nombre")).toHaveValue("Uno QA");
    expect(row("Variante 1: Negro").getByLabelText("Stock")).toHaveValue(3);
    expect(screen.getByRole("button", { name: /^negro.jpg:/ })).toBeInTheDocument();
    await user.clear(row("Variante 1: Negro").getByLabelText("SKU"));
    await user.type(row("Variante 1: Negro").getByLabelText("SKU"), "UNO-N2");
    await user.click(screen.getByRole("button", { name: "Reintentar lo pendiente" }));
    expect(await screen.findByText(/Ficha del producto/)).toBeInTheDocument();
    expect(
      calls.filter((call) => call.method === "POST" && call.path === "/api/admin/products"),
    ).toHaveLength(1);
    const batches = calls.filter((call) => call.path.endsWith("/variants/batch"));
    expect(
      (batches[1]!.body as { variants: { sku: string }[] }).variants.map((v) => v.sku),
    ).toEqual(["UNO-N2", "UNO-R"]);
  });

  it("a photo of the second variant fails: it says which one, marks it, and the retry creates nothing twice", async () => {
    const user = userEvent.setup();
    const calls = stubBackend({ failCloudinaryOnce: true });
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [
        { color: "Negro", sku: "UNO-N" },
        { color: "Rojo", sku: "UNO-R", photos: [photo("rojo.jpg")] },
      ],
    });
    await user.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El producto y sus variantes se crearon, pero falló la foto 1 de Rojo",
    );
    expect(screen.getByRole("button", { name: /^rojo.jpg:.*falló/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar lo pendiente" }));
    expect(await screen.findByText(/Ficha del producto/)).toBeInTheDocument();
    expect(calls.filter((c) => c.path.endsWith("/variants/batch"))).toHaveLength(1);
    const saved = calls.filter(
      (c) =>
        c.method === "POST" &&
        c.path.endsWith("/images") &&
        !(c.body as { verifyUpload?: boolean }).verifyUpload,
    );
    expect(saved.map((c) => c.path.split("/")[6])).toEqual(["p1-v2"]);
  });

  it("recovers what was typed after a reload, never the photo files", async () => {
    const user = userEvent.setup();
    stubBackend();
    const first = renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [{ color: "Negro", sku: "UNO-1", photos: [photo("uno.jpg")] }],
    });
    await user.type(screen.getByLabelText("Ancho del lente (mm)"), "50");
    const stored = window.localStorage.getItem(STORAGE_KEY)!;
    expect(stored).toContain("Uno QA");
    expect(stored).not.toContain("uno.jpg");
    first.unmount();

    renderPage();
    expect(await screen.findByText(/Recuperamos un borrador sin guardar/)).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Uno QA");
    expect(screen.getByLabelText("Ancho del lente (mm)")).toHaveValue(50);
    expect(row("Variante 1: Negro").getByLabelText("SKU")).toHaveValue("UNO-1");
    expect(
      screen.getByText(/Las fotos elegidas antes de recargar no se conservan/),
    ).toBeInTheDocument();
    expect(screen.queryByText("uno.jpg")).toBeNull();
  });

  it("drafts left by the former tabs: one opens, the others can be resumed or discarded", async () => {
    const user = userEvent.setup();
    const draft = (id: string, name: string) => ({
      id,
      fields: {
        kind: "FRAME",
        name,
        brandId: "",
        categoryId: "",
        shape: "",
        basePrice: "",
        accessoryRole: "",
        soldIndividually: true,
        variants: [],
      },
      progress: { productId: null, variantIds: null, uploadedPhotos: [] },
      photoCount: 0,
    });
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        draft("t1", "Viejo Uno"),
        draft("t2", "Viejo Dos"),
        draft("t3", "Viejo Tres"),
      ]),
    );
    stubBackend();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    expect(await screen.findByDisplayValue("Viejo Uno")).toBeInTheDocument();
    expect(screen.getByText("«Viejo Dos»")).toBeInTheDocument();
    expect(screen.getByText("«Viejo Tres»")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nombre"), " editado");
    await user.click(screen.getAllByRole("button", { name: "Continuar con este" })[0]!);
    expect(screen.getByLabelText("Nombre")).toHaveValue("Viejo Dos");
    // The one left keeps what was typed.
    expect(screen.getByText("«Viejo Uno editado»")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Descartar" }).at(-1)!);
    const names = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).map(
      (d: { fields: { name: string } }) => d.fields.name,
    );
    expect(names).toEqual(expect.arrayContaining(["Viejo Uno editado"]));
    expect(names).not.toContain("Viejo Tres");
  });

  it("leaving with unsaved changes asks first; while saving, leaving is not possible", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const calls = stubBackend({
      holdProductCreate: new Promise<void>((resolve) => (release = resolve)),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    renderPage();
    await fillProduct(user, { name: "Uno QA", price: "1000" });
    await user.click(screen.getByRole("link", { name: "Ir al listado" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("las fotos elegidas se pierden"));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Uno QA");

    await user.click(createButton());
    expect(await screen.findByRole("button", { name: "Guardando…" })).toBeDisabled();
    await user.click(screen.getByRole("link", { name: "Ir al listado" }));
    expect(
      await screen.findByText(/Esperá a que termine de guardarse el producto/),
    ).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(1);
    release();
    expect(await screen.findByText(/Ficha del producto/)).toBeInTheDocument();
    expect(
      calls.filter((call) => call.method === "POST" && call.path === "/api/admin/products"),
    ).toHaveLength(1);
  });
});

describe("AdminNewProductPage — colors, material, SKU and stock", () => {
  it("one palette: the 18 colors, «Combinado» and «Otro color…»; accessories add «Rosado»", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderPage();
    await screen.findByRole("option", { name: "Marca QA" });
    const names = [
      ...["Negro", "Blanco", "Gris", "Plateado", "Dorado", "Marrón", "Beige", "Azul", "Celeste"],
      ...["Verde", "Rojo", "Rosa", "Violeta", "Amarillo", "Naranja", "Carey", "Multicolor"],
      ...["Transparente", "Combinado", "Otro color…"],
    ];
    expect(
      colors()
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")!.textContent),
    ).toEqual(names);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(screen.queryByRole("checkbox", { name: /combina/ })).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Accesorio" }));
    expect(
      colors()
        .getAllByRole("radio")
        .map((radio) => radio.closest("label")!.textContent),
    ).toEqual([...names.slice(0, -1), "Rosado", "Otro color…"]);
  });

  it("«Combinado» shows only its tones: no other palette, checkbox or field", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderPage();
    await fillGeneral(user, { name: "Uno QA", price: "1000" });
    const fields = () => newVariant().getAllByRole("textbox").length;
    const before = fields();
    await user.click(colors().getByRole("radio", { name: "Combinado" }));
    const tones = newVariant().getByRole("group", { name: "Tonos de la pieza combinada" });
    expect(fields()).toBe(before);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(screen.queryByRole("checkbox", { name: /combina/ })).toBeNull();
    expect(within(tones).queryByRole("button", { name: /Multicolor|Combinado/ })).toBeNull();
    expect(within(tones).getAllByRole("button")).toHaveLength(17);
  });

  it("«Combinado» with three tones: one variant, its tones in order", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillGeneral(user, { name: "Uno QA", price: "1000" });
    await addVariant(user, {
      color: "Combinado",
      tones: ["Negro", "Dorado", "Carey"],
      sku: "MOD-3T",
      stock: "1",
    });
    expect(row("Variante 1: Negro, Dorado y carey")).toBeTruthy();
    await user.click(createButton());
    await screen.findByText(/Ficha del producto/);
    expect(batchBody(calls)).toEqual({
      variants: [
        {
          color: "Negro, Dorado y carey",
          material: null,
          colorTones: ["NEGRO", "DORADO", "CAREY"],
          sku: "MOD-3T",
          stock: 1,
        },
      ],
    });
  });

  it("«Combinado» needs two tones or more", async () => {
    const user = userEvent.setup();
    stubBackend();
    renderPage();
    await fillGeneral(user, { name: "Uno QA", price: "1000" });
    await addVariant(user, { color: "Combinado", tones: ["Rojo"], sku: "MOD-1T" });
    expect(newVariant().getByRole("alert")).toHaveTextContent(
      "Elegí al menos dos tonos de la pieza combinada.",
    );
    expect(screen.queryByRole("region", { name: /^Variante 1/ })).toBeNull();
    await addVariant(user, { color: "Combinado", tones: [] });
    expect(newVariant().getByRole("alert")).toHaveTextContent("Elegí al menos dos tonos");
  });

  it("a plain color is saved as before: one variant with its tone", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [
        {
          color: "Celeste",
          material: "Acetato",
          sku: "UNO-C",
          stock: "3",
          photos: [photo("c.jpg")],
        },
      ],
    });
    await user.click(createButton());
    await screen.findByText(/Ficha del producto/);
    expect(batchBody(calls)).toEqual({
      variants: [
        { color: "Celeste", material: "Acetato", colorTones: ["CELESTE"], sku: "UNO-C", stock: 3 },
      ],
    });
  });

  it("«Otro color…» shows only a field for its name: kept by that name, with no tone invented", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillGeneral(user, { name: "Uno QA", price: "1000" });
    const fields = () => newVariant().getAllByRole("textbox").length;
    const before = fields();
    await user.click(colors().getByRole("radio", { name: "Otro color…" }));
    expect(fields()).toBe(before + 1);
    await user.type(newVariant().getByLabelText("SKU"), "UNO-AP");
    await user.click(newVariant().getByRole("button", { name: "Agregar variante" }));
    expect(newVariant().getByRole("alert")).toHaveTextContent("Escribí el nombre del color.");
    await user.type(newVariant().getByLabelText("Nombre del color"), "  Animal   print ");
    await user.type(newVariant().getByLabelText("Stock"), "1");
    await user.click(newVariant().getByRole("button", { name: "Agregar variante" }));
    await user.click(createButton());
    await screen.findByText(/Ficha del producto/);
    expect(batchBody(calls)).toEqual({
      variants: [{ color: "Animal print", material: null, sku: "UNO-AP", stock: 1 }],
    });
  });

  it("an accessory can still be «Rosado», and never repeats a color", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await screen.findByRole("option", { name: "Marca QA" });
    await user.click(screen.getByRole("radio", { name: "Accesorio" }));
    expect(screen.queryByRole("region", { name: "Características y medidas" })).toBeNull();
    await user.type(screen.getByLabelText("Nombre"), "Estuche QA");
    await user.selectOptions(screen.getByLabelText("Marca"), "b1");
    await user.selectOptions(screen.getByLabelText("Categoría"), "c1");
    await user.selectOptions(screen.getByLabelText("Tipo de accesorio"), "CASE");
    await user.type(screen.getByLabelText("Precio (ARS)"), "5000");
    await addVariant(user, { color: "Rosado", material: "Cuero", sku: "EST-ROS", stock: "2" });
    await addVariant(user, { color: "Rosado", sku: "EST-ROS2" });
    expect(newVariant().getByRole("alert")).toHaveTextContent(
      "Rosado ya está en la lista: en un accesorio cada color va una vez.",
    );
    await user.click(newVariant().getByRole("button", { name: "Descartar" }));
    await user.click(screen.getByRole("button", { name: "Crear accesorio" }));
    await screen.findByText(/Ficha del producto/);
    expect(batchBody(calls)).toEqual({
      variants: [{ color: "Rosado", material: "Cuero", sku: "EST-ROS", stock: 2 }],
    });
  });

  it("the same color twice (another material) is two variants, told apart by their SKU", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [
        { color: "Negro", material: "Acetato", sku: "UNO-NA", stock: "1" },
        { color: "Negro", material: "Metal", sku: "UNO-NM", stock: "4" },
      ],
    });
    await user.click(createButton());
    await screen.findByText(/Ficha del producto/);
    expect(batchBody(calls)).toEqual({
      variants: [
        { color: "Negro", material: "Acetato", colorTones: ["NEGRO"], sku: "UNO-NA", stock: 1 },
        { color: "Negro", material: "Metal", colorTones: ["NEGRO"], sku: "UNO-NM", stock: 4 },
      ],
    });
  });

  it("refuses a repeated SKU, never sends it, and never generates one", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [{ color: "Negro", sku: "UNO-1" }],
    });
    await addVariant(user, { color: "Blanco", sku: "uno-1" });
    expect(newVariant().getByRole("alert")).toHaveTextContent(
      "El SKU «uno-1» ya está en la lista.",
    );
    await user.clear(newVariant().getByLabelText("SKU"));
    await user.type(newVariant().getByLabelText("SKU"), "UNO-2");
    await user.click(newVariant().getByRole("button", { name: "Agregar variante" }));
    await user.clear(row("Variante 2: Blanco").getByLabelText("SKU"));
    await user.type(row("Variante 2: Blanco").getByLabelText("SKU"), "Uno-1");
    expect(row("Variante 2: Blanco").getByText("SKU repetido en la lista.")).toBeInTheDocument();
    await user.click(createButton());
    expect(row("Variante 2: Blanco").getByLabelText("SKU")).toHaveFocus();
    await user.click(colors().getByRole("radio", { name: "Verde" }));
    expect(newVariant().getByLabelText("SKU")).toHaveValue("");
    expect(writes(calls)).toEqual([]);
  });

  it("«Quitar» removes a variant and its photos block; «Descartar» clears the one being typed", async () => {
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillProduct(user, {
      name: "Uno QA",
      price: "1000",
      variants: [{ color: "Azul", sku: "UNO-AZ", photos: [photo("azul.jpg")] }],
    });
    await user.click(row("Variante 1: Azul").getByRole("button", { name: "Quitar" }));
    expect(screen.queryByRole("region", { name: "Variante 1: Azul" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Fotos de Variante 1: Azul" })).toBeNull();
    await user.click(colors().getByRole("radio", { name: "Rosa" }));
    await user.type(newVariant().getByLabelText("SKU"), "UNO-RS");
    await user.click(newVariant().getByRole("button", { name: "Descartar" }));
    expect(colors().getByRole("radio", { name: "Rosa" })).not.toBeChecked();
    expect(writes(calls)).toEqual([]);
  });

  it("drafts saved before keep their variants: a combined piece with its tones, a free-text color", async () => {
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
            combineColors: true,
            variants: [
              {
                key: "k1",
                combined: true,
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
    const r = within(await screen.findByRole("region", { name: "Variante 1: Rojo y negro" }));
    expect(r.getByLabelText("SKU")).toHaveValue("V-RN");
    expect(r.getByLabelText("Material")).toHaveValue("");
    expect(screen.getByLabelText("Ancho del lente (mm)")).toHaveValue(null);
  });
});

describe("AdminNewProductPage — cristales compatibles, when switched on again", () => {
  const lensBox = (name: string) =>
    within(screen.getByRole("group", { name: "Cristales compatibles (opcional)" })).getByRole(
      "checkbox",
      { name },
    );
  const lensPuts = (calls: Call[]) =>
    calls.filter((call) => call.method === "PUT" && call.path.endsWith("/lens-types"));

  it("saves the chosen types right after the product, with the existing endpoint", async () => {
    features.lens = true;
    const user = userEvent.setup();
    const calls = stubBackend();
    renderPage();
    await fillGeneral(user, { name: "Uno QA", price: "1000" });
    await user.click(await waitFor(() => lensBox("Monofocal")));
    await user.click(createButton());
    expect(await screen.findByText(/Ficha del producto/)).toBeInTheDocument();
    expect(lensPuts(calls).map((call) => [call.path, call.body])).toEqual([
      ["/api/admin/products/p1/lens-types", { lensTypeIds: ["l2"] }],
    ]);
  });

  it("if saving them fails: the product exists, the choice stays, and the retry only saves the lenses", async () => {
    features.lens = true;
    const user = userEvent.setup();
    const calls = stubBackend({ failLensTypesOnce: true });
    renderPage();
    await fillGeneral(user, { name: "Uno QA", price: "1000" });
    await user.click(await waitFor(() => lensBox("Bifocales")));
    await user.click(createButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El producto se creó, pero no sus cristales compatibles",
    );
    expect(lensBox("Bifocales")).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Reintentar lo pendiente" }));
    expect(await screen.findByText(/Ficha del producto/)).toBeInTheDocument();
    expect(
      calls.filter((c) => c.method === "POST" && c.path === "/api/admin/products"),
    ).toHaveLength(1);
    expect(lensPuts(calls)).toHaveLength(2);
  });
});
